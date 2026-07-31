import { buildScoreLookup, SEPARATION_FACTOR } from "@/lib/engine/equivalence";
import { cheaperWins, costOf, round2 } from "@/lib/engine/cost";
import type { BenchmarkRow, MarginRow, PriceRow } from "@/lib/engine/types";
import { createPublicServerClient } from "@/lib/supabase-public.server";

import {
  CONSERVATIVE_HIGH,
  CONSERVATIVE_LOW,
  DISTRIBUTIONS,
  MATERIALITY_USD,
  WORKLOADS,
  type EstimatorInput,
  type EstimatorResult,
} from "./spec";

/**
 * The public estimator.
 *
 * It runs the certify decision — cheapest model clearing (baseline score −
 * measured margin), with the Goodhart discrimination guard in front of it —
 * against the live catalog, and then applies the caller's spend figure to the
 * resulting price delta. It reads the SAME benchmark margins the product uses,
 * so it is structurally incapable of promising a switch the engine refuses.
 */
export async function estimateSaving(input: EstimatorInput): Promise<EstimatorResult> {
  const supabase = createPublicServerClient();

  const [pricesRes, modelsRes, benchRes, marginRes] = await Promise.all([
    supabase.from("host_prices").select("model_key, host, host_label, input_usd_per_mtok, output_usd_per_mtok"),
    supabase.from("model_catalog").select("model_key, display_name, vendor, tier"),
    supabase.from("benchmarks").select("model_key, suite, task_class, score"),
    supabase.from("benchmark_margins").select("suite, task_class, margin"),
  ]);

  const prices = (pricesRes.data ?? []) as PriceRow[];
  const models = modelsRes.data ?? [];
  const benchmarks = (benchRes.data ?? []) as BenchmarkRow[];
  const margins = (marginRes.data ?? []) as MarginRow[];

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
      const onProvider = baselinePrices.filter((p) => p.host === input.provider);
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
      (p) => p.host === input.provider && lookup.score(p.model_key, shape.taskClass) != null,
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
  const baselineScore = lookup.score(baseline.model_key, shape.taskClass);

  if (!baselineScore) {
    return refuse(
      "no_baseline_score",
      "No independent score for that model on this workload.",
      `${nameOf(baseline.model_key)} has no published third-party result for ${shape.label.toLowerCase()} work in the catalog. We do not certify a switch off a model whose quality nobody has measured.`,
    );
  }

  /* -------- the same discrimination guard the engine uses -------- */

  const margin = lookup.margin(baselineScore.suite, shape.taskClass);
  const spread = lookup.spread(shape.taskClass);
  if (spread < margin * SEPARATION_FACTOR) {
    return refuse(
      "benchmark_not_discriminating",
      "The benchmark cannot tell these models apart.",
      `On ${shape.label.toLowerCase()} work the whole field sits within the evaluation's own measurement margin (spread ${spread.toFixed(2)}, margin ±${margin.toFixed(2)}). Any saving we quoted here would rest on noise, so we refuse to quote one.`,
    );
  }

  /* -------- cheapest model clearing the bar -------- */

  const bar = baselineScore.score - margin;
  const candidates = prices
    .filter((p) => p.model_key !== baseline.model_key)
    .map((p) => ({ price: p, cost: mix(p), score: lookup.score(p.model_key, shape.taskClass) }))
    .filter((c) => c.score != null && c.score.score >= bar && c.cost < baselineCost)
    .map((c) => ({ price: c.price, cost: c.cost }));

  if (candidates.length === 0) {
    return refuse(
      "no_cheaper_equal",
      "Nothing cheaper holds the quality bar here.",
      `Every model scoring at or above ${bar.toFixed(2)} on ${baselineScore.suite}/${shape.taskClass} costs more than ${nameOf(baseline.model_key)} for this workload shape. On today's catalog you are not overpaying on this one — that is a real answer, not a failure.`,
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
