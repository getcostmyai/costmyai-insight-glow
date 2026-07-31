import { arbitrageBaseline, sortRecommendations } from "./arbitrage";
import { indexPrices, round2, toMonthly } from "./cost";
import {
  KIND_MIN_PLAN,
  type ModelRow,
  type ModelTier,
  type PriceRow,
  type Recommendation,
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

/**
 * Rung 3 — Rightsize.
 *
 * Runs for every org on every plan; the plan only controls whether the result is
 * shown in full or as a locked teaser. Savings are measured against the Compare
 * baseline, and quantified against the cheapest model of the required tier
 * rather than assuming the whole spend disappears.
 */
export function findOversized(
  usage: UsageAggregate[],
  models: ModelRow[],
  prices: PriceRow[],
): Recommendation[] {
  const tierOf = new Map(models.map((m) => [m.model_key, m.tier]));
  const byModel = indexPrices(prices);
  const out: Recommendation[] = [];

  for (const u of usage) {
    const observed = tierOf.get(u.model_key);
    if (!observed) continue;
    // Not enough evidence to call this workload oversized.
    if (u.requests < MIN_RIGHTSIZE_SAMPLE) continue;
    const required = requiredTierFor(u);
    if (TIER_RANK[observed] <= TIER_RANK[required]) continue;

    const baseline = arbitrageBaseline(u, byModel);
    if (!baseline) continue;

    // Cheapest price point among models that sit at the required tier.
    let target: { price: PriceRow; cost: number } | null = null;
    for (const m of models) {
      if (m.tier !== required) continue;
      for (const price of byModel.get(m.model_key) ?? []) {
        const cost =
          (u.input_tokens / 1_000_000) * price.input_usd_per_mtok +
          (u.output_tokens / 1_000_000) * price.output_usd_per_mtok;
        if (!target || cost < target.cost) target = { price, cost };
      }
    }
    if (!target || target.cost >= baseline.cost) continue;

    const saving = toMonthly(baseline.cost - target.cost, u.days);
    if (saving < 1) continue;

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
      monthlySavingUsd: round2(saving),
      savingPct: round2(((baseline.cost - target.cost) / baseline.cost) * 100),
      basis: "Oversized for the workload",
      note: `${observed}-tier model producing ${Math.round(s.avgOutputTokens)} output tokens on average at ${s.dispersion.toFixed(2)}x dispersion and ${Math.round(s.cadence)} req/day — that shape is ${required}-tier work.`,
      qualityDelta: null,
      marginUsed: null,
      objective: "cost",
    });
  }

  return sortRecommendations(out);
}
