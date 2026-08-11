import { describe, expect, it } from "vitest";

import { findHostArbitrage } from "../arbitrage";
import { evaluateAutonomous, DEFAULT_AUTONOMOUS_POLICY } from "../autonomous";
import { costOf } from "../cost";
import { findQualityMatches } from "../equivalence";
import { expectedLatency } from "../latency";
import { resolveObjective } from "../objectives";
import { findOversized, requiredTierFor } from "../rightsize";
import type {
  BenchmarkRow,
  MarginRow,
  ModelRow,
  PriceRow,
  UsageAggregate,
} from "../types";

const price = (
  model_key: string,
  host: string,
  inp: number,
  out: number,
  latency?: number,
): PriceRow => ({
  model_key,
  host,
  host_label: host,
  input_usd_per_mtok: inp,
  output_usd_per_mtok: out,
  median_latency_ms: latency ?? null,
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

const bench = (model_key: string, score: number, task_class = "lcr"): BenchmarkRow => ({
  model_key,
  suite: "aa",
  task_class,
  score,
});

const margins: MarginRow[] = [{ suite: "aa", task_class: "lcr", margin: 1 }];

describe("cost", () => {
  it("prices input and output per million tokens", () => {
    expect(costOf(price("m", "h", 2, 6), 1_000_000, 500_000)).toBeCloseTo(5);
  });
});

describe("arbitrage (Compare)", () => {
  const prices = [
    price("big-model", "alpha", 10, 30),
    price("big-model", "beta", 6, 18),
    price("big-model", "gamma", 6, 18), // exact tie with beta
  ];

  it("finds the cheaper host for the same model", () => {
    const [rec] = findHostArbitrage([usage()], prices);
    expect(rec.kind).toBe("host_arbitrage");
    expect(rec.toModel).toBe("big-model");
    expect(rec.monthlySavingUsd).toBeGreaterThan(0);
    expect(rec.qualityDelta).toBe(0);
  });

  it("breaks exact price ties alphabetically, never by array order", () => {
    const [a] = findHostArbitrage([usage()], prices);
    const [b] = findHostArbitrage([usage()], [...prices].reverse());
    expect(a.toHost).toBe("beta");
    expect(b.toHost).toBe("beta");
  });

  it("emits nothing when the current host is already cheapest", () => {
    expect(findHostArbitrage([usage({ host: "beta" })], prices)).toHaveLength(0);
  });
});

describe("equivalence (Certify)", () => {
  const prices = [
    price("big-model", "alpha", 10, 30),
    price("mid-model", "alpha", 4, 12),
    price("cheap-model", "alpha", 1, 3),
  ];
  // cheap-model sits 0.8 below big-model: inside the ±1 measured margin.
  const benchmarks = [bench("big-model", 90), bench("mid-model", 89.5), bench("cheap-model", 89.2), bench("weak-model", 70)];

  it("picks the CHEAPEST model clearing the bar, not the best-scoring one", () => {
    const { recommendations } = findQualityMatches([usage()], prices, benchmarks, margins);
    expect(recommendations[0].toModel).toBe("cheap-model");
  });

  it("uses the measured margin rather than a hardcoded tolerance", () => {
    const tight: MarginRow[] = [{ suite: "aa", task_class: "lcr", margin: 0.6 }];
    const { recommendations } = findQualityMatches([usage()], prices, benchmarks, tight);
    // cheap-model (-0.8) now falls outside the band; mid-model (-0.5) wins.
    expect(recommendations[0].toModel).toBe("mid-model");
    expect(recommendations[0].marginUsed).toBe(0.6);
  });

  it("refuses when the benchmark cannot discriminate between models", () => {
    const flat = [bench("big-model", 90), bench("cheap-model", 89.8)];
    const { recommendations, refusals } = findQualityMatches([usage()], prices, flat, margins);
    expect(recommendations).toHaveLength(0);
    expect(refusals[0].reason).toBe("benchmark_not_discriminating");
  });

  it("never recommends a model that costs more than the arbitrage baseline", () => {
    const withCheapHost = [...prices, price("big-model", "beta", 0.5, 1)];
    const { recommendations } = findQualityMatches([usage()], withCheapHost, benchmarks, margins);
    expect(recommendations).toHaveLength(0);
  });

  it("honours a latency ceiling objective", () => {
    const timed = [
      price("big-model", "alpha", 10, 30, 900),
      price("mid-model", "alpha", 4, 12, 400),
      price("cheap-model", "alpha", 1, 3, 5000),
    ];
    const { recommendations } = findQualityMatches(
      [usage()],
      timed,
      benchmarks,
      margins,
      () => ({ objective: "latency", maxLatencyMs: 800 }),
    );
    expect(recommendations[0].toModel).toBe("mid-model");
  });

  it("raises the bar for a quality_floor objective", () => {
    const { recommendations } = findQualityMatches(
      [usage()],
      prices,
      benchmarks,
      margins,
      () => ({ objective: "quality_floor", qualityFloorScore: 89.4 }),
    );
    expect(recommendations[0].toModel).toBe("mid-model");
  });
});

/**
 * Real numbers from the Artificial Analysis feed: gpt-oss-120b publishes
 * median_time_to_first_token_seconds = 0.546 and 193.605 output tokens/sec.
 * Latency is per-workload, so the same host clears a ceiling for a short
 * classification and misses it for a long generation.
 */
describe("latency (measured, not assumed)", () => {
  // weak-model widens the spread so the Goodhart guard does not fire first; it
  // has no price row, so it is never a candidate.
  const benchmarks = [
    bench("big-model", 90),
    bench("mid-model", 89.5),
    bench("cheap-model", 89.2),
    bench("weak-model", 70),
  ];
  const measured = (
    model_key: string,
    inp: number,
    out: number,
    ttft: number,
    tps: number,
  ): PriceRow => ({
    ...price(model_key, "alpha", inp, out),
    median_ttft_ms: ttft,
    output_tps: tps,
    latency_scope: "model",
  });

  const short = usage({ requests: 10_000, output_tokens: 400_000 }); // 40 tokens/request
  const long = usage({ requests: 10_000, output_tokens: 10_000_000 }); // 1,000 tokens/request

  it("derives end-to-end latency from ttft plus the workload's own output length", () => {
    const p = measured("mid-model", 4, 12, 546, 193.605);
    // 546ms + 40 tokens / 193.605 tps = 753ms
    expect(expectedLatency(p, short)!.ms).toBe(753);
    // same host, 1,000-token responses = 5,711ms
    expect(expectedLatency(p, long)!.ms).toBe(5711);
  });

  it("reports scope so a model-wide median is never sold as a host measurement", () => {
    expect(expectedLatency(measured("mid-model", 4, 12, 546, 193.605), short)!.scope).toBe("model");
    const hostTimed = { ...price("mid-model", "alpha", 4, 12, 300) };
    expect(expectedLatency(hostTimed, short)).toEqual({ ms: 300, scope: "host", derived: false });
  });

  it("returns null when the feed has published no latency at all", () => {
    expect(expectedLatency(price("mid-model", "alpha", 4, 12), short)).toBeNull();
  });

  it("recommends a candidate whose measured latency clears the ceiling", () => {
    const timed = [
      measured("big-model", 10, 30, 546, 193.605),
      measured("mid-model", 4, 12, 546, 193.605), // 752ms for this workload
      measured("cheap-model", 1, 3, 900, 20), // 2,900ms — cheaper but too slow
    ];
    const { recommendations, refusals } = findQualityMatches(
      [short],
      timed,
      benchmarks,
      margins,
      () => ({ objective: "latency", maxLatencyMs: 1200 }),
    );
    expect(refusals).toHaveLength(0);
    expect(recommendations[0].toModel).toBe("mid-model");
    expect(recommendations[0].note).toContain("753ms expected");
    expect(recommendations[0].note).toContain("not per endpoint");
  });

  it("refuses when every measured candidate exceeds the ceiling, and says so with the measurement", () => {
    const timed = [
      measured("big-model", 10, 30, 546, 193.605),
      measured("mid-model", 4, 12, 546, 193.605), // 5,711ms on 1,000-token output
      measured("cheap-model", 1, 3, 900, 20),
    ];
    const { recommendations, refusals } = findQualityMatches(
      [long],
      timed,
      benchmarks,
      margins,
      () => ({ objective: "latency", maxLatencyMs: 1200 }),
    );
    expect(recommendations).toHaveLength(0);
    expect(refusals[0].reason).toBe("latency_ceiling_unmet");
    expect(refusals[0].detail).toContain("above the 1200ms ceiling");
    expect(refusals[0].detail).toContain("slowest 50900ms");
  });

  it("distinguishes unmeasured from measured-but-slow in the refusal", () => {
    const { refusals } = findQualityMatches(
      [short],
      [price("big-model", "alpha", 10, 30), price("mid-model", "alpha", 4, 12)],
      benchmarks,
      margins,
      () => ({ objective: "latency", maxLatencyMs: 1200 }),
    );
    expect(refusals[0].reason).toBe("latency_ceiling_unmet");
    expect(refusals[0].detail).toContain("no measured latency yet");
    expect(refusals[0].detail).not.toContain("above the");
  });
});

describe("rightsize", () => {
  const models: ModelRow[] = [
    { model_key: "big-model", display_name: "Big", vendor: "v", tier: "frontier" },
    { model_key: "cheap-model", display_name: "Cheap", vendor: "v", tier: "economy" },
  ];
  const prices = [price("big-model", "alpha", 10, 30), price("cheap-model", "alpha", 1, 3)];

  it("classifies short uniform output as economy work", () => {
    expect(
      requiredTierFor(usage({ output_tokens: 500_000, requests: 10_000, output_p50: 50, output_p95: 60 })),
    ).toBe("economy");
  });

  it("classifies long variable output as frontier work", () => {
    expect(
      requiredTierFor(usage({ output_tokens: 20_000_000, requests: 10_000, output_p50: 1500, output_p95: 4000 })),
    ).toBe("frontier");
  });

  it("flags a frontier model doing economy-shaped work", () => {
    const u = usage({ output_tokens: 500_000, requests: 10_000, output_p50: 50, output_p95: 60 });
    const [rec] = findOversized([u], models, prices);
    expect(rec.kind).toBe("rightsize");
    expect(rec.toModel).toBe("cheap-model");
  });

  it("stays silent when the model already matches the workload", () => {
    const u = usage({
      model_key: "cheap-model",
      output_tokens: 500_000,
      output_p50: 50,
      output_p95: 60,
    });
    expect(findOversized([u], models, prices)).toHaveLength(0);
  });
});

describe("autonomous gate (Govern)", () => {
  const base = {
    kind: "quality_match" as const,
    minPlan: "certify" as const,
    fromModel: "a",
    fromHost: "alpha",
    fromHostLabel: "alpha",
    toModel: "b",
    toHost: "beta",
    toHostLabel: "beta",
    taskHint: "generation",
    savingUsd: 400,
    windowDays: 30,
    monthlySavingUsd: 400,
    savingPct: 30,
    basis: "Quality-matched cheaper model",
    note: "",
    qualityDelta: -0.8,
    marginUsed: 1,
  };
  const on = { ...DEFAULT_AUTONOMOUS_POLICY, enabled: true };

  it("allows an equal-quality cheaper switch (the old +2.0 bar was a bug)", () => {
    expect(evaluateAutonomous(base, on, { now: new Date() }).allowed).toBe(true);
  });

  it("blocks a switch outside the measured equivalence band", () => {
    const v = evaluateAutonomous({ ...base, qualityDelta: -3 }, on, { now: new Date() });
    expect(v).toMatchObject({ allowed: false, reason: "not_equal_quality" });
  });

  it("refuses to act when the margin was never measured", () => {
    const v = evaluateAutonomous({ ...base, marginUsed: null }, on, { now: new Date() });
    expect(v).toMatchObject({ allowed: false, reason: "unmeasured_margin" });
  });

  it("applies the cooldown uniformly", () => {
    const now = new Date("2026-01-10T00:00:00Z");
    const v = evaluateAutonomous(base, on, {
      now,
      lastAutonomousChangeAt: new Date("2026-01-09T12:00:00Z"),
    });
    expect(v).toMatchObject({ allowed: false, reason: "cooldown_active" });
  });

  it("applies the same cooldown to arbitrage switches", () => {
    const now = new Date("2026-01-10T00:00:00Z");
    const v = evaluateAutonomous({ ...base, kind: "host_arbitrage", qualityDelta: 0 }, on, {
      now,
      lastAutonomousChangeAt: new Date("2026-01-09T12:00:00Z"),
    });
    expect(v).toMatchObject({ allowed: false, reason: "cooldown_active" });
  });

  // ---- Dispatch 187: hysteresis band and re-target margin -----------------

  const small = { ...base, monthlySavingUsd: 22, savingUsd: 22 };
  const live = { toModel: "b", toHost: "beta", monthlySavingUsd: 30 };

  it("refuses to enter at $22/mo — under the $25 entry threshold", () => {
    const v = evaluateAutonomous(small, on, { now: new Date() });
    expect(v).toMatchObject({ allowed: false, reason: "saving_below_policy" });
  });

  it("keeps a switch already running at $22/mo — inside the band, above the $20 exit", () => {
    const v = evaluateAutonomous(small, on, { now: new Date(), active: live });
    expect(v.allowed).toBe(true);
  });

  it("gives up a running switch only once it falls under $20/mo", () => {
    const v = evaluateAutonomous({ ...small, monthlySavingUsd: 19.5 }, on, {
      now: new Date(),
      active: live,
    });
    expect(v).toMatchObject({ allowed: false, reason: "saving_below_exit_floor" });
  });

  it("refuses to re-target for a 2% improvement over the switch already running", () => {
    const v = evaluateAutonomous({ ...base, toModel: "c", monthlySavingUsd: 30.6 }, on, {
      now: new Date(),
      active: live,
    });
    expect(v).toMatchObject({ allowed: false, reason: "retarget_below_improvement" });
  });

  it("re-targets once the new destination beats the incumbent by 3%", () => {
    const v = evaluateAutonomous({ ...base, toModel: "c", monthlySavingUsd: 31 }, on, {
      now: new Date(),
      active: live,
    });
    expect(v.allowed).toBe(true);
  });

  it("scopes the cooldown to the workload — a null clock is a free workload", () => {
    expect(
      evaluateAutonomous(base, on, { now: new Date(), lastAutonomousChangeAt: null }).allowed,
    ).toBe(true);
  });

  it("stays off when autonomous mode is disabled", () => {

    expect(evaluateAutonomous(base, DEFAULT_AUTONOMOUS_POLICY, { now: new Date() }).allowed).toBe(
      false,
    );
  });
});

describe("objectives", () => {
  it("lets the most specific rule win", () => {
    const rows = [
      {
        model_key: null,
        host: null,
        task_hint: null,
        objective: "cost" as const,
        quality_floor_score: null,
        max_latency_ms: null,
      },
      {
        model_key: "big-model",
        host: null,
        task_hint: "generation",
        objective: "latency" as const,
        quality_floor_score: null,
        max_latency_ms: 500,
      },
    ];
    expect(resolveObjective(rows, usage()).objective).toBe("latency");
    expect(resolveObjective(rows, usage({ model_key: "other" })).objective).toBe("cost");
  });
});
