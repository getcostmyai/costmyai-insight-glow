import { describe, expect, it } from "vitest";


import {
  INGESTED_FIELDS,
  latencyRowFor,
  marginFor,
  suiteFor,
  transformAaPayload,
  type AaModel,
} from "../aa-catalog";
import { resolveLadder, walkLadder, SEPARATION_THRESHOLD } from "../task-ladder";
import { findQualityMatches } from "../../engine/equivalence";
import type { MarginRow, PriceRow, UsageAggregate } from "../../engine/types";

const model = (slug: string, evals: Record<string, number | null>): AaModel => ({
  slug,
  name: slug,
  evaluations: evals,
});

describe("margin maths", () => {
  it("derives a narrower margin from a larger published sample", () => {
    const big = marginFor([80, 82, 78], 12032);
    const small = marginFor([80, 82, 78], 198);
    expect(big).toBeLessThan(small);
    expect(big).toBeCloseTo(0.71, 1);
    expect(small).toBeCloseTo(5.55, 1);
  });

  it("returns NaN rather than a fabricated number when there is nothing to measure", () => {
    expect(Number.isNaN(marginFor([], 198))).toBe(true);
    expect(Number.isNaN(marginFor([80], 0))).toBe(true);
  });
});

describe("ranked ladder walk", () => {
  const sep = (scores: Record<string, number | null>) => (f: string) => scores[f] ?? null;

  it("takes the first rung that clears the separation threshold", () => {
    expect(walkLadder("coding", sep({ terminalbench_v2_1: 85.8, scicode: 43.2 }))).toBe(0);
  });

  it("falls through to the next rung when the first cannot separate models", () => {
    expect(walkLadder("coding", sep({ terminalbench_v2_1: 4.1, scicode: 43.2 }))).toBe(1);
  });

  it("REFUSES rather than borrowing an instrument when every rung is saturated", () => {
    const r = resolveLadder("reasoning", sep({ hle: 2, gpqa: 3 }));
    expect(r.field).toBeNull();
    expect(r.rung).toBe(-1);
    expect(r.refusal).toBe("benchmark_not_discriminating");
    expect(r.detail).toContain("differentiates enough");
  });

  it("REFUSES unconditionally for categories with no valid instrument", () => {
    for (const task of ["translation", "prediction", "recommendation", "monitoring", "simulation"]) {
      const r = resolveLadder(task, () => 99);
      expect(r.refusal).toBe("no_valid_instrument");
      expect(r.field).toBeNull();
    }
  });

  it("never falls back to a composite index", () => {
    expect(resolveLadder("classification", sep({ lcr: 1 })).field).toBeNull();
  });

  it("uses the same threshold as the ported ladder", () => {
    expect(SEPARATION_THRESHOLD).toBe(10.0);
  });
});

describe("transform", () => {
  const models = [
    model("alpha", { gpqa: 0.9, scicode: 0.5, lcr: 0.7 }),
    model("beta", { gpqa: 0.86, scicode: 0.45, lcr: null }),
    model("gamma", { gpqa: 0.7, scicode: 0.3, lcr: 0.4 }),
  ];

  it("stores every certifiable field under its own instrument task_class", () => {
    const r = transformAaPayload(models, ["alpha", "beta", "gamma"]);
    const gpqa = r.scores.filter((s) => s.task_class === "gpqa");
    expect(gpqa).toHaveLength(3);
    expect(new Set(gpqa.map((s) => s.suite))).toEqual(new Set(["aa:gpqa"]));
    expect(r.unmatchedModels).toHaveLength(0);
  });

  it("skips a model with no reported score instead of imputing one", () => {
    const r = transformAaPayload(models, ["alpha", "beta", "gamma"]);
    expect(r.scores.filter((s) => s.task_class === "lcr")).toHaveLength(2);
    expect(r.skipped.some((s) => s.model_key === "beta" && s.task_class === "lcr")).toBe(true);
  });

  it("pairs every margin with the exact suite its scores were written under", () => {
    const r = transformAaPayload(models, ["alpha", "beta", "gamma"]);
    for (const m of r.margins) {
      expect(r.scores.some((s) => s.suite === m.suite && s.task_class === m.task_class)).toBe(true);
    }
    expect(r.margins.map((m) => m.suite)).toContain(
      suiteFor(INGESTED_FIELDS.find((f) => f.field === "gpqa")!),
    );
  });

  it("reports a model missing from the feed rather than silently dropping it", () => {
    const r = transformAaPayload(models, ["alpha", "does-not-exist"]);
    expect(r.unmatchedModels).toEqual(["does-not-exist"]);
  });
});

/**
 * The point of the whole exercise: with no measured margin the engine refuses,
 * and the SAME scenario produces a real certified switch once the margin the
 * sync actually wrote is supplied.
 */
describe("fail-closed flips to certified once real margins exist", () => {
  const usage: UsageAggregate[] = [
    {
      model_key: "expensive",
      host: "alpha",
      task_hint: "reasoning",
      requests: 10_000,
      input_tokens: 50_000_000,
      output_tokens: 10_000_000,
      cost_usd: 0,
      days: 30,
    },
  ];
  const prices: PriceRow[] = [
    {
      model_key: "expensive",
      host: "alpha",
      host_label: "alpha",
      input_usd_per_mtok: 10,
      output_usd_per_mtok: 30,
    },
    {
      model_key: "cheap",
      host: "alpha",
      host_label: "alpha",
      input_usd_per_mtok: 1,
      output_usd_per_mtok: 3,
    },
    {
      model_key: "weak",
      host: "alpha",
      host_label: "alpha",
      input_usd_per_mtok: 0.2,
      output_usd_per_mtok: 0.6,
    },
  ];
  // Real shape: GPQA points, 2.8 apart — inside the measured ±5.378 band.
  const benchmarks = [
    { model_key: "expensive", suite: "aa:gpqa", task_class: "hle", score: 91.5 },
    { model_key: "cheap", suite: "aa:gpqa", task_class: "hle", score: 88.7 },
    { model_key: "weak", suite: "aa:gpqa", task_class: "hle", score: 55.0 },
  ];
  const realMargin: MarginRow[] = [{ suite: "aa:gpqa", task_class: "hle", margin: 5.378 }];

  it("refuses with no margin row (fallback band is too tight for the real gap)", () => {
    const { recommendations, refusals } = findQualityMatches(usage, prices, benchmarks, []);
    expect(recommendations).toHaveLength(0);
    expect(refusals[0].reason).toBe("no_candidate_clears_bar");
  });

  it("certifies the cheapest model inside the real measured band", () => {
    const { recommendations } = findQualityMatches(usage, prices, benchmarks, realMargin);
    expect(recommendations).toHaveLength(1);
    expect(recommendations[0].toModel).toBe("cheap");
    expect(recommendations[0].marginUsed).toBe(5.378);
    expect(recommendations[0].qualityDelta).toBe(-2.8);
  });

  it("still refuses the model that falls outside the real band", () => {
    const onlyWeak = prices.filter((p) => p.model_key !== "cheap");
    const { recommendations, refusals } = findQualityMatches(
      usage,
      onlyWeak,
      benchmarks,
      realMargin,
    );
    expect(recommendations).toHaveLength(0);
    expect(refusals[0].reason).toBe("no_candidate_clears_bar");
  });
});

describe("latency rows from the live feed shape", () => {
  const model = {
    slug: "gpt-oss-120b",
    name: "gpt-oss-120b (high)",
    evaluations: {},
    median_time_to_first_token_seconds: 0.546,
    median_output_tokens_per_second: 193.605,
  };

  it("converts the published medians into stored units and records the scope", () => {
    expect(latencyRowFor("gpt-oss-120b", model)).toEqual({
      model_key: "gpt-oss-120b",
      median_ttft_ms: 546,
      output_tps: 193.61,
      scope: "model",
      source: "artificialanalysis.ai/gpt-oss-120b#median_time_to_first_token_seconds",
    });
  });

  it("leaves a model unmeasured when either component is missing", () => {
    expect(latencyRowFor("x", { ...model, median_output_tokens_per_second: null })).toBeNull();
    expect(latencyRowFor("x", { ...model, median_time_to_first_token_seconds: null })).toBeNull();
    expect(latencyRowFor("x", { ...model, median_output_tokens_per_second: 0 })).toBeNull();
  });
});
