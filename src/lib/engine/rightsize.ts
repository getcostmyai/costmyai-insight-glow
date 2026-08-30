import { arbitrageBaseline, sortRecommendations } from "./arbitrage";
import { cheaperWins, costOfUsage, indexPrices, round2, savingPctOf, toMonthly } from "./cost";
import {
  KIND_MIN_PLAN,
  type ModelRow,
  type ModelTier,
  type PriceRow,
  type Recommendation,
  type Refusal,
  type UsageAggregate,
} from "./types";

/**
 * A workload has to be observed enough times before its shape means anything.
 * Response-length dispersion collapses toward 1 on a thin sample — a genuinely
 * open-ended workload that ran fifty times looks deceptively uniform — so a
 * downgrade below this many observed requests would be a guess dressed up as a
 * measurement. Under it, the check refuses instead.
 */
export const MIN_RIGHTSIZE_SAMPLE = 200;

export const TIER_RANK: Record<ModelTier, number> = { economy: 0, standard: 1, frontier: 2 };

export interface WorkloadShape {
  avgOutputTokens: number;
  avgInputTokens: number;
  /** p95/p50 output length. 1 means every response is the same length. */
  dispersion: number;
  /** Requests per day — high-cadence traffic is almost never frontier work. */
  cadence: number;
}

/**
 * Observed shape only — token counts, length dispersion, cadence.
 * No prompt content is read, ever. This is the whole basis of the rightsize check.
 */
export function shapeOf(u: UsageAggregate): WorkloadShape {
  const requests = Math.max(u.requests, 1);
  const avgOutputTokens = u.output_tokens / requests;
  const p50 = u.output_p50 ?? avgOutputTokens;
  const p95 = u.output_p95 ?? avgOutputTokens;
  return {
    avgOutputTokens,
    avgInputTokens: u.input_tokens / requests,
    dispersion: p50 > 0 ? p95 / p50 : 1,
    cadence: u.days > 0 ? requests / u.days : requests,
  };
}

/**
 * The tier the observed traffic actually needs.
 *
 * Short, uniform, high-cadence responses are mechanical work. Long, highly
 * variable responses are open-ended reasoning. Everything in between is standard.
 */
export function requiredTierFor(u: UsageAggregate): ModelTier {
  const s = shapeOf(u);

  // Very short and very uniform output = a classifier or an extractor, whatever it is called.
  if (s.avgOutputTokens < 120 && s.dispersion < 1.6) return "economy";

  // High cadence with short output is a pipeline step, not reasoning.
  if (s.cadence > 2000 && s.avgOutputTokens < 300) return "economy";

  // Long AND variable output is genuine open-ended generation.
  if (s.avgOutputTokens > 1200 && s.dispersion > 2) return "frontier";

  // Long but uniform output (templated reports) does not need a frontier model.
  if (s.avgOutputTokens > 1200) return "standard";

  // Large context with substantial output: real reasoning load.
  if (s.avgInputTokens > 20000 && s.avgOutputTokens > 600) return "frontier";

  if (s.avgOutputTokens > 300) return "standard";
  return "economy";
}

/** Plain-English names for the tiers, for copy a first-time reader can parse. */
const TIER_WORD: Record<ModelTier, string> = {
  economy: "budget",
  standard: "mid-range",
  frontier: "top-end",
};

/**
 * The card copy, in plain language.
 *
 * The three observed facts stay — average reply length, how much that length
 * varies, and how often the workload runs — but they are stated as what a
 * reader can picture rather than as statistics. "Dispersion 1.60x" means the
 * long replies are only 1.6 times the typical one, which is the actual point:
 * the work is repetitive, so a cheaper model covers it.
 */
export function rightsizeNote(
  observed: ModelTier,
  required: ModelTier,
  s: WorkloadShape,
): string {
  const varies =
    s.dispersion < 1.6
      ? `and reply length hardly varies (the longest run about ${s.dispersion.toFixed(1)}x the typical one)`
      : `and reply length varies moderately (the longest run about ${s.dispersion.toFixed(1)}x the typical one)`;
  return (
    `This workload replies with about ${Math.round(s.avgOutputTokens)} tokens on average, runs ` +
    `${Math.round(s.cadence).toLocaleString("en-US")} times a day, ${varies}. ` +
    `That is routine, repeatable work — a cheaper ${TIER_WORD[required]} model handles it, ` +
    `and you are currently paying ${TIER_WORD[observed]} prices for it.`
  );
}

/**
 * Level 3 — Rightsize.
 *
 * Runs for every org on every plan; the plan only controls whether the result is
 * shown in full or as a locked teaser. Savings are measured against the Compare
 * baseline, and quantified against the cheapest model of the required tier
 * rather than assuming the whole spend disappears.
 */
export interface RightsizeResult {
  recommendations: Recommendation[];
  refusals: Refusal[];
}

export function findOversizedFull(
  usage: UsageAggregate[],
  models: ModelRow[],
  prices: PriceRow[],
): RightsizeResult {
  const tierOf = new Map(models.map((m) => [m.model_key, m.tier]));
  const byModel = indexPrices(prices);
  const out: Recommendation[] = [];
  const refusals: Refusal[] = [];

  const refuse = (u: UsageAggregate, reason: Refusal["reason"], detail: string) =>
    refusals.push({
      kind: "rightsize",
      fromModel: u.model_key,
      fromHost: u.host,
      taskHint: u.task_hint,
      reason,
      detail,
    });

  for (const u of usage) {
    const observed = tierOf.get(u.model_key);
    if (!observed) {
      refuse(u, "no_model_tier", `No tier classification on record for ${u.model_key}.`);
      continue;
    }
    // Not enough evidence to call this workload oversized.
    if (u.requests < MIN_RIGHTSIZE_SAMPLE) {
      refuse(
        u,
        "insufficient_sample",
        `Only ${u.requests} requests observed, under the ${MIN_RIGHTSIZE_SAMPLE}-request minimum sample Rightsize requires before trusting the shape.`,
      );
      continue;
    }
    const required = requiredTierFor(u);
    if (TIER_RANK[observed] <= TIER_RANK[required]) {
      refuse(
        u,
        "already_right_sized",
        `${u.model_key} (${observed}) is already at or below the ${required} tier this workload needs.`,
      );
      continue;
    }

    const baseline = arbitrageBaseline(u, byModel);
    if (!baseline) {
      refuse(u, "no_baseline_price", `No price on record for ${u.model_key} on any host.`);
      continue;
    }

    // Cheapest price point among models that sit at the required tier.
    // Priced through costOfUsage so this level uses the one cost formula every
    // other level uses — a local copy of the arithmetic is how two levels start
    // quoting different savings for the same pair. Ties break through
    // cheaperWins for the same reason the other two levels do: two hosts at an
    // identical price must resolve by name, not by whichever row the feed
    // happened to return first, or the same workload recommends a different
    // vendor on different syncs. That is the Neutrality Charter's determinism
    // clause, and it was the one level not honouring it.
    let target: { price: PriceRow; cost: number } | null = null;
    for (const m of models) {
      if (m.tier !== required) continue;
      for (const price of byModel.get(m.model_key) ?? []) {
        const candidate = { price, cost: costOfUsage(price, u) };
        if (!target || cheaperWins(candidate, target) < 0) target = candidate;
      }
    }
    if (!target) {
      refuse(u, "no_target_tier_priced", `No priced model found at the required ${required} tier.`);
      continue;
    }
    if (target.cost >= baseline.cost) {
      refuse(
        u,
        "no_cheaper_candidate",
        `Cheapest ${required}-tier model (${target.price.model_key}@${target.price.host}) is not cheaper than the current baseline.`,
      );
      continue;
    }

    const rawSaving = baseline.cost - target.cost;
    const saving = toMonthly(rawSaving, u.days);
    if (saving < 1) {
      refuse(
        u,
        "saving_below_floor",
        `Best right-sizing option saves only $${saving.toFixed(2)}/month, under the $1 floor.`,
      );
      continue;
    }

    const s = shapeOf(u);
    out.push({
      kind: "rightsize",
      minPlan: KIND_MIN_PLAN.rightsize,
      fromModel: u.model_key,
      fromHost: u.host,
      fromHostLabel: baseline.price.host_label,
      toModel: target.price.model_key,
      toHost: target.price.host,
      toHostLabel: target.price.host_label,
      taskHint: u.task_hint,
      savingUsd: round2(rawSaving),
      windowDays: u.days,
      monthlySavingUsd: round2(saving),
      savingPct: savingPctOf(baseline.cost, target.cost),
      basis: "Oversized for the workload",
      note: rightsizeNote(observed, required, s),
      qualityDelta: null,
      marginUsed: null,
      objective: "cost",
    });
  }

  return { recommendations: sortRecommendations(out), refusals };
}

/** Back-compat wrapper: recommendations only. */
export function findOversized(
  usage: UsageAggregate[],
  models: ModelRow[],
  prices: PriceRow[],
): Recommendation[] {
  return findOversizedFull(usage, models, prices).recommendations;
}
