import { FIELD_SPECS } from "@/lib/benchmarks/task-ladder";
import { buildScoreLookup } from "@/lib/engine/equivalence";
import { cheaperWins, costOf, round2 } from "@/lib/engine/cost";
import type { BenchmarkRow, MarginRow, PriceRow } from "@/lib/engine/types";

import {
  CONSERVATIVE_HIGH,
  CONSERVATIVE_LOW,
  DISTRIBUTIONS,
  MATERIALITY_USD,
  WORKLOADS,
  type EstimatorInput,
  type EstimatorResult,
} from "./spec";

export interface CatalogModelRow {
  model_key: string;
  display_name: string;
}

export interface EstimatorCatalog {
  prices: PriceRow[];
  models: CatalogModelRow[];
  benchmarks: BenchmarkRow[];
  margins: MarginRow[];
}

/**
 * THE estimator decision. Pure: it takes catalog rows and an input, and returns
 * the same result shape whether it is called by the public server function or
 * by the summary pass that pre-computes the indicative bands the slider
 * interpolates on the client. There is exactly one implementation so the
 * instant number and the authoritative number can never come from different
 * logic — only from different resolutions of the same read.
 *
 * It runs the certify decision — cheapest model clearing (baseline score −
 * measured margin), with the Goodhart discrimination guard in front of it —
 * and then applies the caller's spend figure to the resulting price delta.
 */
export function resolveEstimate(
  catalog: EstimatorCatalog,
  input: EstimatorInput,
): EstimatorResult {
  const { prices, models, benchmarks, margins } = catalog;

  const shape = WORKLOADS.find((w) => w.id === input.workload) ?? WORKLOADS[0];
  const dist = DISTRIBUTIONS.find((d) => d.id === input.distribution) ?? DISTRIBUTIONS[1];
  const nameOf = (key: string) =>
    models.find((m) => m.model_key === key)?.display_name ?? key;

  const refuse = (
    reason: Extract<EstimatorResult, { state: "refused" }>["reason"],
    headline: string,
    detail: string,
  ): EstimatorResult => ({ state: "refused", reason, headline, detail });

  const lookup = buildScoreLookup(benchmarks, margins);
  const mix = (p: PriceRow) => costOf(p, shape.inputTokens, shape.outputTokens);

  /*
   * Ladder walk first: which instrument, if any, may certify this kind of work.
   * No passing rung means we say so plainly rather than quote a saving that
   * rests on a benchmark which cannot separate the models.
   */
  const resolution = lookup.instrument(shape.taskClass);
  if (!resolution.field) {
    return refuse(
      // The estimator is driven by a task class the visitor picked, so a
      // classifier refusal cannot arise here; it maps to the same "nothing
      // measured this" answer rather than claiming a benchmark was consulted.
      resolution.refusal === "benchmark_not_discriminating"
        ? "benchmark_not_discriminating"
        : "no_valid_instrument",
      resolution.refusal === "benchmark_not_discriminating"
        ? "No model currently differentiates enough on this to certify a switch."
        : "No independent instrument measures this kind of work.",
      resolution.detail,
    );
  }
  const instrument = resolution.field;

  /* -------- pick the baseline the estimate is measured against -------- */

  let baselinePrices: PriceRow[] = [];

  if (input.modelKey) {
    const known = models.some((m) => m.model_key === input.modelKey);
    if (!known) {
      return refuse(
        "model_not_in_catalog",
        "That model is not in the live catalog.",
        `We have no priced entry for "${input.modelKey}", so there is nothing to measure a switch against. We would rather say that than estimate off a model we cannot see.`,
      );
    }
    baselinePrices = prices.filter((p) => p.model_key === input.modelKey);
    if (input.provider) {
      const onProvider = baselinePrices.filter((p) => p.host_label === input.provider);
      if (onProvider.length > 0) baselinePrices = onProvider;
    }
    if (baselinePrices.length === 0) {
      return refuse(
        "model_not_in_catalog",
        "That model has no live price on record.",
        `${nameOf(input.modelKey)} is in the catalog but no host currently publishes a price we have verified, so any dollar figure would be invented.`,
      );
    }
  } else if (input.provider) {
    const onProvider = prices.filter(
      (p) => p.host_label === input.provider && lookup.score(p.model_key, instrument) != null,
    );
    if (onProvider.length === 0) {
      return refuse(
        "shape_only",
        "Not enough to work with yet.",
        `We have no benchmarked, priced model on that provider for ${shape.label.toLowerCase()} work. Spend shape alone cannot tell us what you are running — name a model, or connect Compare and we will read it from your traffic.`,
      );
    }
    // Median-cost model on that provider: conservative, not the priciest one.
    const sorted = [...onProvider].sort((a, b) => mix(a) - mix(b));
    baselinePrices = [sorted[Math.floor(sorted.length / 2)]];
  } else {
    return refuse(
      "shape_only",
      "A spend figure alone is not a measurement.",
      "Without a provider or a model we would be guessing at what you run, and a guess with a dollar sign in front of it is exactly what this product exists to replace. Pick a provider, or connect Compare — it reads your real traffic for free.",
    );
  }

  const baseline = [...baselinePrices].sort((a, b) => mix(a) - mix(b))[0];
  const baselineCost = mix(baseline);
  const baselineScore = lookup.score(baseline.model_key, instrument);

  if (!baselineScore) {
    return refuse(
      "no_baseline_score",
      "No independent score for that model on this workload.",
      `${nameOf(baseline.model_key)} has no published third-party result on ${FIELD_SPECS[instrument].label}, the instrument that certifies ${shape.label.toLowerCase()} work. We do not certify a switch off a model whose quality nobody has measured.`,
    );
  }

  /* -------- the equivalence band, on the instrument the ladder picked -------- */

  const margin = lookup.margin(baselineScore.suite, instrument);

  /* -------- cheapest model clearing the bar -------- */

  const bar = baselineScore.score - margin;
  const candidates = prices
    .filter((p) => p.model_key !== baseline.model_key)
    .map((p) => ({ price: p, cost: mix(p), score: lookup.score(p.model_key, instrument) }))

    .filter((c) => c.score != null && c.score.score >= bar && c.cost < baselineCost)
    .map((c) => ({ price: c.price, cost: c.cost }));

  if (candidates.length === 0) {
    return refuse(
      "no_cheaper_equal",
      "Nothing cheaper holds the quality bar here.",
      `Every model scoring at or above ${bar.toFixed(2)} on ${baselineScore.suite}/${FIELD_SPECS[instrument].label} costs more than ${nameOf(baseline.model_key)} for this workload shape. On today's catalog you are not overpaying on this one — that is a real answer, not a failure.`,
    );
  }

  const winner = [...candidates].sort(cheaperWins)[0];
  const savingPct = (baselineCost - winner.cost) / baselineCost;
  const modelled = input.monthlySpendUsd * dist.share * savingPct;

  const lowUsd = round2(modelled * CONSERVATIVE_LOW);
  const highUsd = round2(modelled * CONSERVATIVE_HIGH);

  if (highUsd < MATERIALITY_USD) {
    return {
      state: "below_threshold",
      highUsd,
      floorUsd: MATERIALITY_USD,
      fromModelLabel: nameOf(baseline.model_key),
      taskClass: shape.taskClass,
    };
  }

  return {
    state: "ok",
    lowUsd,
    highUsd,
    savingPct: round2(savingPct * 100),
    fromModel: baseline.model_key,
    fromModelLabel: nameOf(baseline.model_key),
    toModel: winner.price.model_key,
    toModelLabel: nameOf(winner.price.model_key),
    toHostLabel: winner.price.host_label,
    suite: baselineScore.suite,
    taskClass: shape.taskClass,
    margin: round2(margin),
    sharePct: Math.round(dist.share * 100),
    assumedMix: `${shape.inputTokens.toLocaleString()} in / ${shape.outputTokens.toLocaleString()} out tokens per request`,
  };
}
