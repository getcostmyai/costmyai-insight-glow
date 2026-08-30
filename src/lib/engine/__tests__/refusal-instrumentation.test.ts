import { describe, expect, it } from "vitest";

import { findHostArbitrageFull } from "../arbitrage";
import { findOversizedFull, MIN_RIGHTSIZE_SAMPLE } from "../rightsize";
import { refusalClass } from "../refusal-class";
import type { ModelRow, PriceRow, UsageAggregate } from "../types";

/**
 * Problem #6 (premortem, benchmark representativeness). Proves, against
 * mocked inputs only, that every real disqualifying branch in Compare's and
 * Rightsize's loops now emits a Refusal with the correct kind/reason/class
 * instead of a silent `continue`.
 */

const price = (model_key: string, host: string, inp: number, out: number): PriceRow => ({
  model_key,
  host,
  host_label: host,
  input_usd_per_mtok: inp,
  output_usd_per_mtok: out,
  median_latency_ms: null,
});

const usage = (over: Partial<UsageAggregate> = {}): UsageAggregate => ({
  model_key: "big-model",
  host: "alpha",
  task_hint: "generation",
  requests: 10_000,
  input_tokens: 50_000_000,
  output_tokens: 10_000_000,
  cost_usd: 0,
  days: 30,
  ...over,
});

describe("Compare refusal instrumentation", () => {
  it("no_baseline_price: current host has no price row at all", () => {
    const { recommendations, refusals } = findHostArbitrageFull(
      [usage({ model_key: "unpriced-model" })],
      [price("big-model", "alpha", 10, 30)],
    );
    expect(recommendations).toHaveLength(0);
    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toMatchObject({ kind: "host_arbitrage", reason: "no_baseline_price" });
    expect(refusalClass(refusals[0].reason)).toBe("unmeasurable");
  });

  it("no_cheaper_candidate: current host is already the cheapest priced host", () => {
    const { recommendations, refusals } = findHostArbitrageFull(
      [usage()],
      [price("big-model", "alpha", 6, 18), price("big-model", "beta", 10, 30)],
    );
    expect(recommendations).toHaveLength(0);
    expect(refusals[0]).toMatchObject({ kind: "host_arbitrage", reason: "no_cheaper_candidate" });
    expect(refusalClass(refusals[0].reason)).toBe("no_candidate");
  });

  it("saving_below_floor: a cheaper host exists but the saving is under $1/mo", () => {
    const { recommendations, refusals } = findHostArbitrageFull(
      [usage({ requests: 1, input_tokens: 100, output_tokens: 100 })],
      [price("big-model", "alpha", 10, 30), price("big-model", "beta", 9.999, 29.999)],
    );
    expect(recommendations).toHaveLength(0);
    expect(refusals[0]).toMatchObject({ kind: "host_arbitrage", reason: "saving_below_floor" });
    expect(refusalClass(refusals[0].reason)).toBe("no_candidate");
  });

  it("accepts the real match and emits zero refusals for that workload", () => {
    const { recommendations, refusals } = findHostArbitrageFull(
      [usage()],
      [price("big-model", "alpha", 10, 30), price("big-model", "beta", 6, 18)],
    );
    expect(recommendations).toHaveLength(1);
    expect(refusals).toHaveLength(0);
  });
});

describe("Rightsize refusal instrumentation", () => {
  const models: ModelRow[] = [
    { model_key: "big-model", display_name: "Big", vendor: "v", tier: "frontier" },
    { model_key: "small-model", display_name: "Small", vendor: "v", tier: "economy" },
  ];
  const prices: PriceRow[] = [price("big-model", "alpha", 20, 60), price("small-model", "alpha", 1, 2)];

  const mechanical = (over: Partial<UsageAggregate> = {}) =>
    usage({
      requests: MIN_RIGHTSIZE_SAMPLE + 100,
      output_tokens: (MIN_RIGHTSIZE_SAMPLE + 100) * 50, // short, uniform -> economy tier required
      output_p50: 50,
      output_p95: 60,
      ...over,
    });

  it("no_model_tier: model isn't in the tier catalogue", () => {
    const { recommendations, refusals } = findOversizedFull(
      [mechanical({ model_key: "unknown-model" })],
      models,
      prices,
    );
    expect(recommendations).toHaveLength(0);
    expect(refusals[0]).toMatchObject({ kind: "rightsize", reason: "no_model_tier" });
    expect(refusalClass(refusals[0].reason)).toBe("unmeasurable");
  });

  it("insufficient_sample: fewer requests than MIN_RIGHTSIZE_SAMPLE", () => {
    const { recommendations, refusals } = findOversizedFull(
      [mechanical({ requests: MIN_RIGHTSIZE_SAMPLE - 1 })],
      models,
      prices,
    );
    expect(recommendations).toHaveLength(0);
    expect(refusals[0]).toMatchObject({ kind: "rightsize", reason: "insufficient_sample" });
    expect(refusalClass(refusals[0].reason)).toBe("unmeasurable");
  });

  it("already_right_sized: observed tier is already at or below the required tier", () => {
    const { recommendations, refusals } = findOversizedFull(
      [mechanical({ model_key: "small-model" })],
      models,
      prices,
    );
    expect(recommendations).toHaveLength(0);
    expect(refusals[0]).toMatchObject({ kind: "rightsize", reason: "already_right_sized" });
    expect(refusalClass(refusals[0].reason)).toBe("no_candidate");
  });

  it("no_baseline_price: no price on record for the current model on any host", () => {
    const { recommendations, refusals } = findOversizedFull(
      [mechanical({ model_key: "big-model", host: "unpriced-host" })],
      models,
      [price("small-model", "alpha", 1, 2)],
    );
    expect(recommendations).toHaveLength(0);
    expect(refusals[0]).toMatchObject({ kind: "rightsize", reason: "no_baseline_price" });
    expect(refusalClass(refusals[0].reason)).toBe("unmeasurable");
  });

  it("no_target_tier_priced: no model priced at the required tier", () => {
    const { recommendations, refusals } = findOversizedFull(
      [mechanical()],
      models,
      [price("big-model", "alpha", 20, 60)], // no economy-tier price at all
    );
    expect(recommendations).toHaveLength(0);
    expect(refusals[0]).toMatchObject({ kind: "rightsize", reason: "no_target_tier_priced" });
    expect(refusalClass(refusals[0].reason)).toBe("unmeasurable");
  });

  it("no_cheaper_candidate: a target at the required tier exists but isn't cheaper", () => {
    const { recommendations, refusals } = findOversizedFull(
      [mechanical()],
      models,
      [price("big-model", "alpha", 20, 60), price("small-model", "alpha", 25, 70)],
    );
    expect(recommendations).toHaveLength(0);
    expect(refusals[0]).toMatchObject({ kind: "rightsize", reason: "no_cheaper_candidate" });
    expect(refusalClass(refusals[0].reason)).toBe("no_candidate");
  });

  it("saving_below_floor: cheaper target exists but saving is under $1/mo", () => {
    const { recommendations, refusals } = findOversizedFull(
      [mechanical({ requests: MIN_RIGHTSIZE_SAMPLE, output_tokens: MIN_RIGHTSIZE_SAMPLE * 50, days: 30 })],
      models,
      [price("big-model", "alpha", 20, 60), price("small-model", "alpha", 19.999, 59.999)],
    );
    expect(recommendations).toHaveLength(0);
    expect(refusals[0]).toMatchObject({ kind: "rightsize", reason: "saving_below_floor" });
    expect(refusalClass(refusals[0].reason)).toBe("no_candidate");
  });

  it("accepts the real match and emits zero refusals for that workload", () => {
    const { recommendations, refusals } = findOversizedFull([mechanical()], models, prices);
    expect(recommendations).toHaveLength(1);
    expect(refusals).toHaveLength(0);
  });
});
