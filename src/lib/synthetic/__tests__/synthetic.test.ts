import { describe, expect, it } from "vitest";

import { costOf } from "@/lib/engine/cost";
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
import { lifecycleFactor, SYNTHETIC_WORKLOADS } from "@/lib/synthetic/workloads";

const price = (model: string, host: string, i: number, o: number): PriceRow => ({
  model_key: model,
  host,
  host_label: host,
  input_usd_per_mtok: i,
  output_usd_per_mtok: o,
});

const PRICES: PriceRow[] = [
  price("o1-pro", "api.openai.com", 150, 600),
  price("gpt-5.5", "api.openai.com", 2.5, 10),
  price("gpt-5.4", "api.openai.com", 2, 8),
  price("gpt-4", "api.openai.com", 30, 60),
  price("claude-opus-4-5", "api.anthropic.com", 15, 75),
  price("claude-opus-4-7", "api.anthropic.com", 15, 75),
  price("claude-opus-4-7-fast", "api.anthropic.com", 8, 40),
  price("qwen3-coder-next", "dashscope.aliyuncs.com", 0.9, 3.6),
  price("gpt-oss-120b", "api.deepinfra.com", 0.15, 0.6),
  price("deepseek-v4-flash", "api.venice.ai", 0.28, 1.12),
  price("qwen3-32b", "api.groq.com", 0.29, 0.59),
  price("gpt-5-6-terra", "openai", 1, 4),
  price("gpt-5-6-luna", "openai", 0.2, 0.8),
];
const priceFor = (m: string, h: string) => PRICES.find((p) => p.model_key === m && p.host === h);

const MODELS: ModelRow[] = [
  { model_key: "o1-pro", display_name: "o1-pro", vendor: "openai", tier: "frontier" },
  { model_key: "gpt-5.5", display_name: "GPT-5.5", vendor: "openai", tier: "frontier" },
  { model_key: "gpt-5.4", display_name: "GPT-5.4", vendor: "openai", tier: "frontier" },
  { model_key: "gpt-4", display_name: "GPT-4", vendor: "openai", tier: "frontier" },
  { model_key: "claude-opus-4-5", display_name: "Opus 4.5", vendor: "anthropic", tier: "frontier" },
  { model_key: "claude-opus-4-7", display_name: "Opus 4.7", vendor: "anthropic", tier: "frontier" },
  { model_key: "claude-opus-4-7-fast", display_name: "Opus 4.7 Fast", vendor: "anthropic", tier: "frontier" },
  { model_key: "qwen3-coder-next", display_name: "Qwen3 Coder", vendor: "alibaba", tier: "standard" },
  { model_key: "gpt-oss-120b", display_name: "gpt-oss-120b", vendor: "openai", tier: "standard" },
  { model_key: "deepseek-v4-flash", display_name: "DeepSeek V4 Flash", vendor: "deepseek", tier: "economy" },
  { model_key: "qwen3-32b", display_name: "Qwen3 32B", vendor: "alibaba", tier: "economy" },
  { model_key: "gpt-5-6-terra", display_name: "GPT-5.6 Terra", vendor: "openai", tier: "standard" },
  { model_key: "gpt-5-6-luna", display_name: "GPT-5.6 Luna", vendor: "openai", tier: "economy" },
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
    const classifier = profiles.find((p) => p.modelKey === "qwen3-32b")!;
    const research = profiles.find((p) => p.modelKey === "o1-pro")!;
    expect(research.complexityScore).toBeGreaterThan(classifier.complexityScore);
  });

  it("flags the templated and short frontier workloads as oversized, and nothing else", () => {
    expect(oversizedProfiles(profiles).map((p) => p.modelKey).sort()).toEqual([
      "claude-opus-4-7-fast",
      "gpt-4",
      "gpt-5.4",
    ]);
  });

  it("never marks a workload oversized when the shape genuinely needs the tier", () => {
    const research = profiles.find((p) => p.modelKey === "o1-pro")!;
    expect(research.requiredTier).toBe("frontier");
  });

  it("normalises cost to a 30-day month", () => {
    const p = profiles.find((x) => x.modelKey === "qwen3-32b")!;
    const u = usage.find((x) => x.model_key === "qwen3-32b")!;
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
      .filter((r) => r.host === "api.openai.com")
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
