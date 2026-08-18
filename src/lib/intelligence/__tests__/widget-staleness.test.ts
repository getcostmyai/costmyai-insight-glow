/**
 * What the embeddable widget is allowed to say when it cannot refresh.
 *
 * This surface is the only one in the product that lives on other people's
 * websites, where nobody at CostMyAI would ever see it go wrong. Its copy
 * promises figures "refreshed every five minutes", so a silently frozen cache
 * is not a degraded experience — it is a false claim, published under our name,
 * indefinitely. These tests pin the two honest outcomes: labelled staleness
 * inside a bounded window, and an explicit unavailable card past it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const readIntelligence = vi.fn();

vi.mock("../intelligence.server", () => ({
  readIntelligence: (...args: unknown[]) => readIntelligence(...args),
}));

const snapshot = () => ({
  generatedAt: "2026-08-18T00:00:00Z",
  monthLabel: "August 2026",
  monthStart: "2026-08-01",
  trackingSince: null,
  liveModels: 10,
  liveHosts: 5,
  changesTotal: 4,
  increases: 2,
  decreases: 2,
  newListings: 0,
  topIncreases: [],
  topDecreases: [],
  repricers: [],
  spreads: [],
  frontier: [],
  hostBuckets: [],
});

describe("widget staleness", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-18T12:00:00Z"));
    readIntelligence.mockReset();
    const { __resetWidgetState } = await import("../widget.server");
    __resetWidgetState();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("labels a last-good payload as stale when the refresh fails inside the window", async () => {
    const { readWidgetPayload, WIDGET_CACHE_TTL_MS } = await import("../widget.server");

    readIntelligence.mockResolvedValue(snapshot());
    const fresh = await readWidgetPayload();
    expect(fresh.stale).toBeUndefined();

    // The feed breaks, and the cache goes cold enough to force a refresh.
    readIntelligence.mockRejectedValue(new Error("upstream down"));
    vi.setSystemTime(Date.now() + WIDGET_CACHE_TTL_MS + 1_000);

    const served = await readWidgetPayload();
    expect(served.stale).toBe(true);
    expect(served.stats).toEqual(fresh.stats);
  });

  it("refuses to serve the old payload at all once the stale window is exhausted", async () => {
    const { readWidgetPayload, WIDGET_STALE_SERVE_MAX_MS } = await import("../widget.server");

    readIntelligence.mockResolvedValue(snapshot());
    await readWidgetPayload();

    readIntelligence.mockRejectedValue(new Error("upstream down"));
    vi.setSystemTime(Date.now() + WIDGET_STALE_SERVE_MAX_MS + 60_000);

    await expect(readWidgetPayload()).rejects.toThrow("upstream down");
  });

  it("states the age of the figures on the rendered card, and flags a stale one", async () => {
    const { renderWidgetDocument, renderWidgetUnavailable } = await import("../widget-html.server");
    const base = {
      month: "August 2026",
      generatedAt: "2026-08-18T00:00:00Z",
      computedAt: Date.parse("2026-08-18T11:30:00Z"),
      stats: [{ id: "mom-moves" as const, value: "36", label: "price changes", detail: "", tone: "brand" as const }],
    };

    const live = renderWidgetDocument(base, { origin: "https://costmyai.com", nonce: "n" });
    expect(live).toContain("As of 2026-08-18 11:30 UTC");

    const stale = renderWidgetDocument(
      { ...base, stale: true },
      { origin: "https://costmyai.com", nonce: "n" },
    );
    expect(stale).toContain("Last refreshed 2026-08-18 11:30 UTC");
    expect(stale).toContain('data-stale="1"');

    const gone = renderWidgetUnavailable({ origin: "https://costmyai.com", nonce: "n" });
    expect(gone).toContain("Figures temporarily unavailable");
    expect(gone).not.toContain("36");
  });
});
