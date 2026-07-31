import { describe, expect, it } from "vitest";

import { costOf } from "@/lib/engine/cost";
import { MIN_RIGHTSIZE_SAMPLE } from "@/lib/engine/rightsize";
import type { ModelRow, PriceRow } from "@/lib/engine/types";
import {
  bucketStart,
  DAY_MS,
  generateEvents,
  HOUR_MS,
  lognormal,
  mulberry32,
  percentile,
  rollupEvents,
} from "@/lib/synthetic/generator";
import { aggregateRollups, buildBilling, buildProfiles, oversizedProfiles } from "@/lib/synthetic/profiles";
import { activeFraction, sizeWorkloads, TARGET_MONTHLY_SPEND_USD } from "@/lib/synthetic/sizing";
import { lifecycleFactor, SYNTHETIC_BILLING_PROVIDERS, SYNTHETIC_WORKLOADS } from "@/lib/synthetic/workloads";

const price = (model: string, host: string, i: number, o: number): PriceRow => ({
  model_key: model,
  host,
  host_label: host,
  input_usd_per_mtok: i,
  output_usd_per_mtok: o,
});

const PRICES: PriceRow[] = [
  price("openai/o1-pro", "openai", 150, 600),
  price("openai/gpt-5.5", "azure", 2.5, 10),
  price("openai/gpt-5.4", "azure", 2, 8),
  price("openai/gpt-4", "azure", 30, 60),
  price("anthropic/claude-opus-4.5", "anthropic", 15, 75),
  price("anthropic/claude-opus-4.7", "azure", 15, 75),
  price("anthropic/claude-opus-4.7-fast", "anthropic", 8, 40),
  price("qwen/qwen3-coder-next", "alibaba", 0.9, 3.6),
  price("openai/gpt-oss-120b", "groq", 0.15, 0.6),
  price("deepseek/deepseek-v4-flash", "venice", 0.28, 1.12),
  price("qwen/qwen3-32b", "groq", 0.29, 0.59),
  price("openai/gpt-5.6-terra", "azure", 1, 4),
  price("openai/gpt-5.6-luna", "azure", 0.2, 0.8),
];
const priceFor = (m: string, h: string) => PRICES.find((p) => p.model_key === m && p.host === h);

const MODELS: ModelRow[] = [
  { model_key: "openai/o1-pro", display_name: "openai/o1-pro", vendor: "openai", tier: "frontier" },
  { model_key: "openai/gpt-5.5", display_name: "GPT-5.5", vendor: "openai", tier: "frontier" },
  { model_key: "openai/gpt-5.4", display_name: "GPT-5.4", vendor: "openai", tier: "frontier" },
  { model_key: "openai/gpt-4", display_name: "GPT-4", vendor: "openai", tier: "frontier" },
  { model_key: "anthropic/claude-opus-4.5", display_name: "Opus 4.5", vendor: "anthropic", tier: "frontier" },
  { model_key: "anthropic/claude-opus-4.7", display_name: "Opus 4.7", vendor: "anthropic", tier: "frontier" },
  { model_key: "anthropic/claude-opus-4.7-fast", display_name: "Opus 4.7 Fast", vendor: "anthropic", tier: "frontier" },
  { model_key: "qwen/qwen3-coder-next", display_name: "Qwen3 Coder", vendor: "alibaba", tier: "standard" },
  { model_key: "openai/gpt-oss-120b", display_name: "openai/gpt-oss-120b", vendor: "openai", tier: "standard" },
  { model_key: "deepseek/deepseek-v4-flash", display_name: "DeepSeek V4 Flash", vendor: "deepseek", tier: "economy" },
  { model_key: "qwen/qwen3-32b", display_name: "Qwen3 32B", vendor: "alibaba", tier: "economy" },
  { model_key: "openai/gpt-5.6-terra", display_name: "GPT-5.6 Terra", vendor: "openai", tier: "standard" },
  { model_key: "openai/gpt-5.6-luna", display_name: "GPT-5.6 Luna", vendor: "openai", tier: "economy" },
];

const WINDOW_DAYS = 30;
const TO = new Date("2026-07-31T00:00:00.000Z");
const FROM = new Date(TO.getTime() - WINDOW_DAYS * DAY_MS);

// Sized against a smaller target than production so the suite stays fast; the
// distribution logic under test is identical at any target.
const TEST_TARGET_USD = 1000;
const SIZED = sizeWorkloads(SYNTHETIC_WORKLOADS, priceFor, {
  windowDays: WINDOW_DAYS,
  targetMonthlyUsd: TEST_TARGET_USD,
});

function eventsFor(workloadIndex = 0, seed = "test") {
  return generateEvents({ workload: SIZED[workloadIndex], from: FROM, to: TO, seed });
}

describe("deterministic generation", () => {
  it("produces identical output for the same seed and window", () => {
    expect(eventsFor(1)).toEqual(eventsFor(1));
  });

  it("produces different output for a different seed", () => {
    expect(eventsFor(1, "a")).not.toEqual(eventsFor(1, "b"));
  });

  it("mulberry32 is stable and bounded", () => {
    const r = mulberry32(42);
    const draws = [r(), r(), r()];
    expect(draws.every((d) => d >= 0 && d < 1)).toBe(true);
    const again = mulberry32(42);
    expect([again(), again(), again()]).toEqual(draws);
  });
});

describe("event shape", () => {
  const events = eventsFor(1);

  it("stays inside the requested window", () => {
    expect(events.every((e) => e.occurredAt >= FROM && e.occurredAt < TO)).toBe(true);
  });

  it("carries metadata only — no content field exists on an event", () => {
    expect(Object.keys(events[0]).sort()).toEqual([
      "host",
      "inputTokens",
      "latencyMs",
      "modelKey",
      "occurredAt",
      "outputTokens",
      "status",
      "taskHint",
    ]);
  });

  it("charges input tokens but no output tokens for failed calls", () => {
    const failed = events.filter((e) => e.status === "error");
    expect(failed.length).toBeGreaterThan(0);
    expect(failed.every((e) => e.inputTokens > 0 && e.outputTokens === 0)).toBe(true);
  });

  it("lands within 12% of the solved daily cadence", () => {
    const perDay = events.length / WINDOW_DAYS;
    const target = SIZED[1].requestsPerDay;
    expect(Math.abs(perDay - target) / target).toBeLessThan(0.12);
  });

  it("is busier during the working day than overnight", () => {
    const inHours = events.filter((e) => {
      const h = e.occurredAt.getUTCHours();
      return h >= 9 && h < 18;
    }).length;
    expect(inHours / events.length).toBeGreaterThan(0.5);
  });

  it("reproduces the configured median response length", () => {
    const outputs = events
      .filter((e) => e.status === "ok")
      .map((e) => e.outputTokens)
      .sort((a, b) => a - b);
    const p50 = percentile(outputs, 50);
    expect(Math.abs(p50 - SIZED[1].outputP50) / SIZED[1].outputP50).toBeLessThan(0.1);
  });

  it("draws log-normally around the median", () => {
    const rand = mulberry32(7);
    const draws = Array.from({ length: 4000 }, () => lognormal(rand, 1000, 2500)).sort((a, b) => a - b);
    expect(Math.abs(percentile(draws, 50) - 1000)).toBeLessThan(80);
    expect(Math.abs(percentile(draws, 95) - 2500)).toBeLessThan(300);
  });
});

describe("rollups are derived, never asserted", () => {
  const events = SIZED.flatMap((_, i) => eventsFor(i));
  const hourly = rollupEvents(events, "hour", priceFor);
  const daily = rollupEvents(events, "day", priceFor);

  it("conserves every request and token at both granularities", () => {
    for (const rows of [hourly, daily]) {
      expect(rows.reduce((s, r) => s + r.requests, 0)).toBe(events.length);
      expect(rows.reduce((s, r) => s + r.inputTokens, 0)).toBe(
        events.reduce((s, e) => s + e.inputTokens, 0),
      );
      expect(rows.reduce((s, r) => s + r.outputTokens, 0)).toBe(
        events.reduce((s, e) => s + e.outputTokens, 0),
      );
    }
  });

  it("prices every bucket through the engine cost function", () => {
    for (const r of hourly) {
      const p = priceFor(r.modelKey, r.host)!;
      expect(r.costUsd).toBeCloseTo(costOf(p, r.inputTokens, r.outputTokens), 10);
    }
  });

  it("aligns buckets to the hour and the day", () => {
    expect(hourly.every((r) => r.bucketStart.getTime() % HOUR_MS === 0)).toBe(true);
    expect(daily.every((r) => r.bucketStart.getTime() % DAY_MS === 0)).toBe(true);
    expect(bucketStart(new Date("2026-07-31T13:42:11Z"), "day").toISOString()).toBe(
      "2026-07-31T00:00:00.000Z",
    );
  });

  it("reports p95 at or above p50 in every bucket", () => {
    expect(hourly.every((r) => r.outputP95 >= r.outputP50)).toBe(true);
  });

  it("rolls hours up to exactly the same daily totals", () => {
    const fromHours = hourly.reduce((s, r) => s + r.costUsd, 0);
    const fromDays = daily.reduce((s, r) => s + r.costUsd, 0);
    expect(fromHours).toBeCloseTo(fromDays, 8);
  });
});

describe("workload profiles", () => {
  const daily = rollupEvents(
    SIZED.flatMap((_, i) => eventsFor(i)),
    "day",
    priceFor,
  );
  const usage = aggregateRollups(daily, WINDOW_DAYS);
  const profiles = buildProfiles(usage, MODELS, priceFor);

  it("profiles every workload", () => {
    expect(profiles).toHaveLength(SYNTHETIC_WORKLOADS.length);
  });

  it("scores complexity between 0 and 1, ordered by how open-ended the work is", () => {
    expect(profiles.every((p) => p.complexityScore >= 0 && p.complexityScore <= 1)).toBe(true);
    const classifier = profiles.find((p) => p.modelKey === "qwen/qwen3-32b")!;
    const research = profiles.find((p) => p.modelKey === "openai/o1-pro")!;
    expect(research.complexityScore).toBeGreaterThan(classifier.complexityScore);
  });

  it("refuses to call a thinly-observed workload oversized", () => {
    const o1 = profiles.find((p) => p.modelKey === "openai/o1-pro")!;
    // Winding down: ~50 requests left in the window. Too few for dispersion to
    // mean anything, so the check declines rather than guessing.
    expect(o1.requests).toBeLessThan(MIN_RIGHTSIZE_SAMPLE);
    expect(oversizedProfiles(profiles).map((p) => p.modelKey)).not.toContain("openai/o1-pro");
  });

  it("flags the templated and short frontier workloads as oversized, and nothing else", () => {
    expect(oversizedProfiles(profiles).map((p) => p.modelKey).sort()).toEqual([
      "anthropic/claude-opus-4.7-fast",
      "openai/gpt-4",
      "openai/gpt-5.4",
    ]);
  });

  it("never marks a workload oversized when the shape genuinely needs the tier", () => {
    const composer = profiles.find((p) => p.modelKey === "openai/gpt-5.5")!;
    expect(composer.requiredTier).toBe("frontier");
    expect(oversizedProfiles(profiles).map((p) => p.modelKey)).not.toContain("openai/gpt-5.5");
  });

  it("normalises cost to a 30-day month", () => {
    const p = profiles.find((x) => x.modelKey === "qwen/qwen3-32b")!;
    const u = usage.find((x) => x.model_key === "qwen/qwen3-32b")!;
    expect(p.monthlyCostUsd).toBeCloseTo((u.cost_usd / WINDOW_DAYS) * 30, 1);
  });
});

describe("billing reconciliation", () => {
  const daily = rollupEvents(
    SIZED.flatMap((_, i) => eventsFor(i)),
    "day",
    priceFor,
  );

  it("calls small gaps a match and larger ones a real disagreement", () => {
    const pairs = buildBilling(daily, FROM, TO, { openai: -0.031, anthropic: 0.008, groq: 0.041 });
    const openai = pairs.find((p) => p.provider === "openai")!;
    const anthropic = pairs.find((p) => p.provider === "anthropic")!;
    const groq = pairs.find((p) => p.provider === "groq")!;
    expect(anthropic.verdict).toBe("match");
    expect(openai.verdict).toBe("over_estimated");
    expect(groq.verdict).toBe("under_estimated");
  });

  it("derives the estimate from the same priced rollups the dashboard shows", () => {
    const pairs = buildBilling(daily, FROM, TO, {});
    const openaiSpend = daily
      .filter((r) => SYNTHETIC_BILLING_PROVIDERS.openai.includes(r.host))
      .reduce((s, r) => s + r.costUsd, 0);
    expect(pairs.find((p) => p.provider === "openai")!.estimatedUsd).toBeCloseTo(openaiSpend, 1);
  });

  it("keys captures idempotently per provider and period", () => {
    const a = buildBilling(daily, FROM, TO, {});
    const b = buildBilling(daily, FROM, TO, {});
    expect(a.map((p) => p.idempotencyKey)).toEqual(b.map((p) => p.idempotencyKey));
    expect(new Set(a.map((p) => p.idempotencyKey)).size).toBe(a.length);
  });
});

describe("volume is solved against live pricing, not scaled flat", () => {
  it("hits the target monthly spend from the generated events themselves", () => {
    const daily = rollupEvents(
      SIZED.flatMap((_, i) => eventsFor(i)),
      "day",
      priceFor,
    );
    const spend = daily.reduce((s, r) => s + r.costUsd, 0);
    expect(Math.abs(spend - TEST_TARGET_USD) / TEST_TARGET_USD).toBeLessThan(0.1);
  });

  it("gives an expensive model orders of magnitude fewer requests than a cheap one", () => {
    const o1 = SIZED.find((w) => w.modelKey === "openai/o1-pro")!;
    const qwen = SIZED.find((w) => w.modelKey === "qwen/qwen3-32b")!;
    // o1-pro carries 6.7x the spend share on a fraction of the request count.
    expect(o1.spendShare / qwen.spendShare).toBeGreaterThan(5);
    expect(qwen.requestsPerDay / o1.requestsPerDay).toBeGreaterThan(100);
  });

  it("prices a request through the engine cost function, expected tokens not median", () => {
    const w = SIZED.find((x) => x.modelKey === "openai/gpt-5.5")!;
    const p = priceFor(w.modelKey, w.host)!;
    // Right-skewed token draws bill above the median, so the per-request cost
    // must exceed the naive median-based figure or the target is undershot.
    const naive = costOf(p, w.inputP50, w.outputP50);
    expect(w.costPerRequestUsd).toBeGreaterThan(naive);
  });

  it("refuses to size a workload with no synced price", () => {
    expect(() => sizeWorkloads(SYNTHETIC_WORKLOADS, () => undefined)).toThrow(/No live price/);
  });

  it("keeps the spend distribution concentrated, not uniform", () => {
    const shares = [...SYNTHETIC_WORKLOADS].sort((a, b) => b.spendShare - a.spendShare);
    const top3 = shares.slice(0, 3).reduce((s, w) => s + w.spendShare, 0);
    expect(top3).toBeGreaterThan(0.4);
    expect(shares.at(-1)!.spendShare).toBeLessThan(0.02);
  });

  it("sizes the production ecosystem inside the specified $15k-$20k band", () => {
    const sized = sizeWorkloads(SYNTHETIC_WORKLOADS, priceFor);
    const monthly = sized.reduce(
      (s, w) => s + w.requestsPerDay * 30 * w.costPerRequestUsd * activeFraction(w, 30),
      0,
    );
    expect(monthly).toBeGreaterThan(15_000);
    expect(monthly).toBeLessThan(20_000);
    expect(TARGET_MONTHLY_SPEND_USD).toBe(17_500);
  });
});

describe("workload-set evolution", () => {
  const arriving = SYNTHETIC_WORKLOADS.find((w) => w.modelKey === "openai/gpt-5.6-terra")!;
  const leaving = SYNTHETIC_WORKLOADS.find((w) => w.modelKey === "openai/o1-pro")!;

  it("has both new arrivals and phase-outs in the set", () => {
    expect(SYNTHETIC_WORKLOADS.filter((w) => w.lifecycle?.introducedDaysAgo).length).toBeGreaterThan(1);
    expect(SYNTHETIC_WORKLOADS.filter((w) => w.lifecycle?.retiringSinceDaysAgo).length).toBeGreaterThan(1);
  });

  it("ramps a new model up from nothing to steady state over about a week", () => {
    expect(lifecycleFactor(12, arriving)).toBe(0);
    expect(lifecycleFactor(11, arriving)).toBeCloseTo(0, 5);
    expect(lifecycleFactor(7.5, arriving)).toBeCloseTo(0.5, 1);
    expect(lifecycleFactor(4, arriving)).toBe(1);
    expect(lifecycleFactor(0, arriving)).toBe(1);
  });

  it("ramps a retiring workload down on the same shape", () => {
    expect(lifecycleFactor(10, leaving)).toBe(1);
    expect(lifecycleFactor(5.5, leaving)).toBeCloseTo(0.5, 1);
    expect(lifecycleFactor(1, leaving)).toBe(0);
  });

  it("only uses models that carry a live synced price", () => {
    for (const w of SYNTHETIC_WORKLOADS) expect(priceFor(w.modelKey, w.host)).toBeDefined();
  });

  it("shows an arrival growing and a retirement draining in the generated traffic", () => {
    const idx = SIZED.findIndex((w) => w.modelKey === "openai/gpt-5.6-terra");
    const events = eventsFor(idx);
    const half = new Date(TO.getTime() - 5 * DAY_MS);
    const before = events.filter((e) => e.occurredAt < half).length / 25;
    const after = events.filter((e) => e.occurredAt >= half).length / 5;
    expect(after).toBeGreaterThan(before * 2);

    const outIdx = SIZED.findIndex((w) => w.modelKey === "openai/o1-pro");
    const out = eventsFor(outIdx);
    const lastTwoDays = out.filter((e) => e.occurredAt >= new Date(TO.getTime() - 2 * DAY_MS)).length;
    expect(lastTwoDays).toBe(0);
  });

  it("keeps sizing honest across a ramp: a part-time workload still hits its share", () => {
    const w = SIZED.find((x) => x.modelKey === "openai/gpt-5.6-luna")!;
    const events = generateEvents({ workload: w, from: FROM, to: TO, seed: "test" });
    const spend = rollupEvents(events, "day", priceFor).reduce((s, r) => s + r.costUsd, 0);
    expect(Math.abs(spend - w.targetMonthlyUsd) / w.targetMonthlyUsd).toBeLessThan(0.15);
  });
});

describe("live traffic is a continuation of the same curve", () => {
  const workload = SIZED.find((w) => w.modelKey === "openai/gpt-oss-120b")!;
  const hourStart = new Date(TO.getTime() - HOUR_MS);

  const slice = (from: Date, to: Date) =>
    generateEvents({ workload, from, to, windowStart: FROM, windowEnd: TO, seed: "test" });

  it("splits an hour into minute slices with no gaps or duplicates", () => {
    const whole = slice(hourStart, TO);
    const pieces = [];
    for (let t = hourStart.getTime(); t < TO.getTime(); t += 60_000) {
      pieces.push(...slice(new Date(t), new Date(t + 60_000)));
    }
    expect(pieces).toEqual(whole);
  });

  it("emits only events inside the requested slice", () => {
    const from = new Date(hourStart.getTime() + 17 * 60_000);
    const to = new Date(from.getTime() + 90_000);
    expect(slice(from, to).every((e) => e.occurredAt >= from && e.occurredAt < to)).toBe(true);
  });

  it("is deterministic per slice, so a retried tick cannot double-count", () => {
    const from = new Date(hourStart.getTime() + 5 * 60_000);
    const to = new Date(from.getTime() + 60_000);
    expect(slice(from, to)).toEqual(slice(from, to));
  });
});
