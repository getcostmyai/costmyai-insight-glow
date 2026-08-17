import { describe, expect, it } from "vitest";

import { findQualityMatches } from "@/lib/engine/equivalence";
import {
  BENCHMARK_FEED,
  BENCHMARK_MAX_AGE_MS,
  PRICING_FEED,
  benchmarksAreCertifiable,
  pricingIsLive,
} from "@/lib/sync-freshness";

/**
 * Dispatch 230. Two claims used to survive an integration outage untouched: the
 * catalogue kept pulsing "Live" because a sync had once succeeded, and the
 * engine kept certifying equal quality against scores nobody had re-measured.
 * Both now fail closed on age, and these pin that they stay that way.
 */

const usage = [
  {
    model_key: "openai/gpt-5.5",
    host: "openai",
    task_hint: "chat",
    input_tokens: 1_000_000,
    output_tokens: 200_000,
    requests: 100,
    cost_usd: 100,
  },
] as never as Parameters<typeof findQualityMatches>[0];

describe("stale evidence fails closed", () => {
  it("refuses every workload when the benchmark feed is stale", () => {
    const result = findQualityMatches(usage, [], [], [], undefined, {
      lastSyncedAt: "2026-08-01T00:00:00.000Z",
    });
    expect(result.recommendations).toHaveLength(0);
    expect(result.refusals).toHaveLength(1);
    expect(result.refusals[0]!.reason).toBe("benchmark_data_stale");
    expect(result.refusals[0]!.detail).toContain("2026-08-01");
  });

  it("refuses when the feed has never successfully synced", () => {
    const result = findQualityMatches(usage, [], [], [], undefined, { lastSyncedAt: null });
    expect(result.refusals[0]!.detail).toContain("never successfully measured");
  });

  it("bounds certification by the benchmark cadence", () => {
    const now = Date.parse("2026-08-17T12:00:00.000Z");
    expect(benchmarksAreCertifiable(new Date(now - 1_000).toISOString(), now)).toBe(true);
    expect(
      benchmarksAreCertifiable(new Date(now - BENCHMARK_MAX_AGE_MS - 1_000).toISOString(), now),
    ).toBe(false);
    expect(benchmarksAreCertifiable(null, now)).toBe(false);
  });

  it("bounds the LIVE claim by age, not by having ever succeeded", () => {
    const now = Date.parse("2026-08-17T12:00:00.000Z");
    expect(pricingIsLive(new Date(now - 60_000).toISOString(), now)).toBe(true);
    expect(pricingIsLive(new Date(now - 6 * 3_600_000).toISOString(), now)).toBe(false);
    expect(pricingIsLive(null, now)).toBe(false);
  });

  it("names the two feeds explicitly, so a run of one cannot vouch for the other", () => {
    expect(PRICING_FEED).toBe("openrouter");
    expect(BENCHMARK_FEED).toBe("artificial_analysis");
  });
});
