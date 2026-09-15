import { describe, expect, it, beforeEach, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

import {
  degradeRead,
  withDeadline,
  PUBLIC_READ_TIMEOUT_MS,
  __resetPublicReadCache,
} from "../public-data.server";
import { EMPTY_CATALOG, EMPTY_PARTNER_LADDER, emptyIntelligence } from "../public-empty";
import { ensurePublicQuery } from "../public-query";

describe("public read degradation", () => {
  beforeEach(() => {
    __resetPublicReadCache();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("keeps the whole-read deadline inside a page budget", () => {
    expect(PUBLIC_READ_TIMEOUT_MS).toBeLessThanOrEqual(3000);
  });

  it("rejects work that runs past the deadline", async () => {
    await expect(
      withDeadline(new Promise(() => {}), 20, "slow read"),
    ).rejects.toThrow(/timed out after 20ms/);
  });

  it("returns the empty result rather than throwing when the read fails", async () => {
    const res = await degradeRead(
      "t-catalog",
      async () => {
        throw new Error("Data API request timed out after 3000ms");
      },
      EMPTY_CATALOG,
    );
    expect(res.degraded).toBe(true);
    expect(res.rows).toEqual([]);
  });

  it("returns the empty result rather than hanging when the read is late", async () => {
    const res = await degradeRead("t-late", () => new Promise(() => {}), EMPTY_CATALOG, 20);
    expect(res.degraded).toBe(true);
  });

  it("serves last known values flagged degraded, never silently", async () => {
    const good = { ...EMPTY_CATALOG, rows: [{ model_key: "a" }] as never, degraded: undefined };
    await degradeRead("t-mem", async () => good, EMPTY_CATALOG);

    const res = await degradeRead(
      "t-mem",
      async () => {
        throw new Error("down");
      },
      EMPTY_CATALOG,
    );
    expect(res.rows).toHaveLength(1);
    expect(res.degraded).toBe(true);
  });

  it("passes a healthy read straight through, unflagged", async () => {
    const res = await degradeRead("t-ok", async () => ({ ...EMPTY_CATALOG, degraded: false }), EMPTY_CATALOG);
    expect(res.degraded).toBe(false);
  });

  it("empty results claim nothing", () => {
    expect(EMPTY_CATALOG.rows).toEqual([]);
    expect(EMPTY_CATALOG.live).toBe(false);
    expect(EMPTY_PARTNER_LADDER.tiers).toEqual([]);
    expect(EMPTY_PARTNER_LADDER.minRatePct).toBeNull();

    const intel = emptyIntelligence(new Date("2026-09-15T00:00:00Z"));
    expect(intel.degraded).toBe(true);
    expect(intel.changesTotal).toBe(0);
    expect(intel.topIncreases).toEqual([]);
    expect(intel.trackingSince).toBeNull();
    expect(intel.monthLabel).toBe("September 2026");
  });
});

describe("ensurePublicQuery", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("seeds the cache with the fallback when the transport fails", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const options = {
      queryKey: ["public-catalog"] as const,
      queryFn: async () => {
        throw new Error("fetch failed");
      },
      retry: false,
    };

    const res = await ensurePublicQuery(qc, options, EMPTY_CATALOG, "public-catalog");
    expect(res.degraded).toBe(true);
    expect(qc.getQueryData(["public-catalog"])).toEqual(EMPTY_CATALOG);
  });

  it("passes real data through untouched", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const good = { ...EMPTY_CATALOG, degraded: false, live: true };
    const res = await ensurePublicQuery(
      qc,
      { queryKey: ["public-catalog-ok"] as const, queryFn: async () => good },
      EMPTY_CATALOG,
      "public-catalog",
    );
    expect(res).toEqual(good);
  });
});
