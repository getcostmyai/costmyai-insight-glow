import {
  KIND_MIN_PLAN,
  type BenchmarkRow,
  type ModelRow,
  type ModelTier,
  type PriceRow,
  type Recommendation,
  type UsageAggregate,
} from "./types";

const DAYS_IN_MONTH = 30;

/** Cost in USD of running a given token mix at a given price point. */
export function costOf(price: PriceRow, inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * price.input_usd_per_mtok +
    (outputTokens / 1_000_000) * price.output_usd_per_mtok
  );
}

function toMonthly(value: number, days: number): number {
  if (days <= 0) return 0;
  return (value / days) * DAYS_IN_MONTH;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function indexPrices(prices: PriceRow[]): Map<string, PriceRow[]> {
  const byModel = new Map<string, PriceRow[]>();
  for (const p of prices) {
    const list = byModel.get(p.model_key) ?? [];
    list.push(p);
    byModel.set(p.model_key, list);
  }
  return byModel;
}

function benchmarkScore(
  benchmarks: BenchmarkRow[],
  modelKey: string,
  taskClass: string,
): number | null {
  const exact = benchmarks.find((b) => b.model_key === modelKey && b.task_class === taskClass);
  if (exact) return exact.score;
  const fallback = benchmarks.find(
    (b) => b.model_key === modelKey && b.task_class === "generation",
  );
  return fallback ? fallback.score : null;
}

/**
 * Step 1 — Compare (free tier).
 * Same model, cheaper host. The only check that carries zero quality risk,
 * so it always runs first and every downstream check is priced against its result.
 */
export function findHostArbitrage(
  usage: UsageAggregate[],
  prices: PriceRow[],
): Recommendation[] {
  const byModel = indexPrices(prices);
  const out: Recommendation[] = [];

  for (const u of usage) {
    const candidates = byModel.get(u.model_key) ?? [];
    const current = candidates.find((p) => p.host === u.host);
    if (!current) continue;

    const currentCost = costOf(current, u.input_tokens, u.output_tokens);
    let best = current;
    let bestCost = currentCost;

    for (const c of candidates) {
      if (c.host === u.host) continue;
      const cost = costOf(c, u.input_tokens, u.output_tokens);
      if (cost < bestCost) {
        best = c;
        bestCost = cost;
      }
    }

    if (best.host === current.host) continue;

    const saving = toMonthly(currentCost - bestCost, u.days);
    if (saving < 1) continue;

    out.push({
      kind: "host_arbitrage",
      minPlan: KIND_MIN_PLAN.host_arbitrage,
      fromModel: u.model_key,
      fromHost: u.host,
      fromHostLabel: current.host_label,
      toModel: u.model_key,
      toHost: best.host,
      toHostLabel: best.host_label,
      taskHint: u.task_hint,
      monthlySavingUsd: round2(saving),
      savingPct: round2(((currentCost - bestCost) / currentCost) * 100),
      basis: "Same model, cheaper host",
      note: `Identical weights and identical output — only the provider changes.`,
      qualityDelta: 0,
    });
  }

  return out.sort((a, b) => b.monthlySavingUsd - a.monthlySavingUsd);
}

/**
 * Step 2 — Certify.
 * A different, cheaper model that benchmarks at the same quality for this task class.
 * Priced against the cheapest host for the current model, so it never double-counts
 * the saving that Compare already found.
 */
export function findQualityMatches(
  usage: UsageAggregate[],
  prices: PriceRow[],
  benchmarks: BenchmarkRow[],
  tolerance = 1.5,
): Recommendation[] {
  const byModel = indexPrices(prices);
  const out: Recommendation[] = [];

  for (const u of usage) {
    const currentPrices = byModel.get(u.model_key) ?? [];
    const current = currentPrices.find((p) => p.host === u.host);
    if (!current) continue;

    // Baseline = best host for the model we are already on (Compare applied first).
    const baselineCost = Math.min(
      ...currentPrices.map((p) => costOf(p, u.input_tokens, u.output_tokens)),
    );
    const currentScore = benchmarkScore(benchmarks, u.model_key, u.task_hint);
    if (currentScore === null) continue;

    let bestPrice: PriceRow | null = null;
    let bestCost = baselineCost;
    let bestScore = currentScore;

    for (const [modelKey, candidatePrices] of byModel) {
      if (modelKey === u.model_key) continue;
      const score = benchmarkScore(benchmarks, modelKey, u.task_hint);
      if (score === null) continue;
      if (score < currentScore - tolerance) continue; // quality refused

      for (const p of candidatePrices) {
        const cost = costOf(p, u.input_tokens, u.output_tokens);
        if (cost < bestCost) {
          bestPrice = p;
          bestCost = cost;
          bestScore = score;
        }
      }
    }

    if (!bestPrice) continue;
    const saving = toMonthly(baselineCost - bestCost, u.days);
    if (saving < 1) continue;

    out.push({
      kind: "quality_match",
      minPlan: KIND_MIN_PLAN.quality_match,
      fromModel: u.model_key,
      fromHost: u.host,
      fromHostLabel: current.host_label,
      toModel: bestPrice.model_key,
      toHost: bestPrice.host,
      toHostLabel: bestPrice.host_label,
      taskHint: u.task_hint,
      monthlySavingUsd: round2(saving),
      savingPct: round2(((baselineCost - bestCost) / baselineCost) * 100),
      basis: "Quality-matched cheaper model",
      note: `Benchmarked at ${bestScore.toFixed(1)} vs ${currentScore.toFixed(1)} on ${u.task_hint} — within tolerance.`,
      qualityDelta: round2(bestScore - currentScore),
    });
  }

  return out.sort((a, b) => b.monthlySavingUsd - a.monthlySavingUsd);
}

const TIER_RANK: Record<ModelTier, number> = { economy: 0, standard: 1, frontier: 2 };

/**
 * Complexity heuristic from observed shape of traffic — no prompt content required.
 * Long generations and code work justify a frontier model; short classification does not.
 */
export function requiredTierFor(u: UsageAggregate): ModelTier {
  const avgOutput = u.requests > 0 ? u.output_tokens / u.requests : 0;
  if (u.task_hint === "classification" || u.task_hint === "extraction") return "economy";
  if (u.task_hint === "code") return avgOutput > 800 ? "frontier" : "standard";
  if (avgOutput > 1500) return "frontier";
  if (avgOutput > 350) return "standard";
  return "economy";
}

/**
 * Step 3 — Rightsize.
 * Workloads running a model at least one tier above what the traffic shape requires.
 */
export function findOversized(
  usage: UsageAggregate[],
  models: ModelRow[],
): Recommendation[] {
  const tierOf = new Map(models.map((m) => [m.model_key, m.tier]));
  const out: Recommendation[] = [];

  for (const u of usage) {
    const observed = tierOf.get(u.model_key);
    if (!observed) continue;
    const required = requiredTierFor(u);
    if (TIER_RANK[observed] <= TIER_RANK[required]) continue;

    const monthlyCost = toMonthly(u.cost_usd, u.days);
    if (monthlyCost < 1) continue;

    out.push({
      kind: "rightsize",
      minPlan: KIND_MIN_PLAN.rightsize,
      fromModel: u.model_key,
      fromHost: u.host,
      fromHostLabel: u.host,
      toModel: null,
      toHost: null,
      toHostLabel: null,
      taskHint: u.task_hint,
      monthlySavingUsd: round2(monthlyCost),
      savingPct: 100,
      basis: "Oversized for the workload",
      note: `${observed[0].toUpperCase() + observed.slice(1)}-tier model on a ${u.task_hint} task averaging ${Math.round(u.output_tokens / Math.max(u.requests, 1))} output tokens — a ${required} tier covers this.`,
      qualityDelta: null,
    });
  }

  return out.sort((a, b) => b.monthlySavingUsd - a.monthlySavingUsd);
}

/**
 * The full pipeline, in the order the product runs it.
 * Each rung is additive: a plan sees its own check plus every check below it.
 */
export function runPipeline(input: {
  usage: UsageAggregate[];
  prices: PriceRow[];
  benchmarks: BenchmarkRow[];
  models: ModelRow[];
}) {
  const hostArbitrage = findHostArbitrage(input.usage, input.prices);
  const qualityMatched = findQualityMatches(input.usage, input.prices, input.benchmarks);
  const oversized = findOversized(input.usage, input.models);

  const evaluated = input.usage.length;
  const refused = Math.max(evaluated - qualityMatched.length, 0);

  return {
    hostArbitrage,
    qualityMatched,
    oversized,
    stats: {
      workloads: evaluated,
      hostCertified: hostArbitrage.length,
      qualityEvaluated: evaluated,
      qualityCertified: qualityMatched.length,
      qualityRefused: refused,
      oversizedFlagged: oversized.length,
    },
  };
}
