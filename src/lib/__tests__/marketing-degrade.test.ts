import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

/**
 * The marketing pages block their SSR on this read. A backend problem must
 * therefore surface as missing counters, never as a document request that
 * hangs, which is exactly what took the live homepage down.
 */

vi.mock("@/lib/supabase-public.server", () => ({
  PUBLIC_DB_TIMEOUT_MS: 3000,
  createPublicServerClient: () => {
    throw new Error("unused");
  },
  DEMO_ORG_ID: "00000000-0000-0000-0000-000000000001",
}));

describe("readMarketingStats degradation", () => {
  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("../marketing.server");
    mod.__resetMarketingStatsCache();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns empty degraded stats instead of throwing when the read errors", async () => {
    const mod = await import("../marketing.server");
    const stats = await mod.readMarketingStats();
    expect(stats.degraded).toBe(true);
    expect(stats.modelCount).toBe(0);
    expect(stats.providers).toEqual([]);
    expect(stats.live).toBe(false);
  });

  it("never rejects even when every underlying call fails", async () => {
    const mod = await import("../marketing.server");
    await expect(mod.readMarketingStats()).resolves.toBeDefined();
  });

  it("has a whole-read deadline well inside a page budget", async () => {
    const mod = await import("../marketing.server");
    expect(mod.MARKETING_STATS_TIMEOUT_MS).toBeLessThanOrEqual(3000);
  });

  it("empty stats claim nothing", async () => {
    const mod = await import("../marketing.server");
    expect(mod.EMPTY_MARKETING_STATS).toMatchObject({
      modelCount: 0,
      providerCount: 0,
      priceChangesTracked: 0,
      trackingSince: null,
      live: false,
      degraded: true,
    });
  });
});

describe("ensureMarketingStats loader guard", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/marketing.functions");
  });

  it("resolves with degraded stats when the server call rejects, and seeds the cache", async () => {
    const { ensureMarketingStats, marketingStatsQuery, DEGRADED_MARKETING_STATS } = await import(
      "../marketing.functions"
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    // The transport itself failing, not just the read degrading server-side.
    queryClient.ensureQueryData = vi.fn().mockRejectedValue(new Error("Data API unreachable"));

    const stats = await ensureMarketingStats(queryClient);

    expect(stats).toEqual(DEGRADED_MARKETING_STATS);
    // Seeded, so the page's useSuspenseQuery resolves instead of suspending forever.
    expect(queryClient.getQueryData(marketingStatsQuery().queryKey)).toEqual(
      DEGRADED_MARKETING_STATS,
    );
  });

  it("passes real stats straight through when the read succeeds", async () => {
    const { ensureMarketingStats } = await import("../marketing.functions");
    const queryClient = new QueryClient();
    const good = {
      modelCount: 12,
      providerCount: 3,
      priceChangesTracked: 7,
      trackingSince: "2026-01-01T00:00:00.000Z",
      providers: ["Groq"],
      live: true,
    };
    queryClient.ensureQueryData = vi.fn().mockResolvedValue(good);
    await expect(ensureMarketingStats(queryClient)).resolves.toEqual(good);
  });
});
