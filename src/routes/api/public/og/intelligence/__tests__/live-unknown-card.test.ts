import { describe, expect, it, vi } from "vitest";

/**
 * Documents a deliberate contract, not an accident: the live OG endpoint serves
 * only cards present in the payload it just read. A card id that no longer
 * resolves — a spread that lost its second provider, a band with nothing
 * clearing the bar — gets a plain 404 rather than a blank or stale poster.
 * Changing this should be a decision, so it is pinned here.
 */
vi.mock("@/lib/intelligence/intelligence.server", () => ({
  readIntelligence: async () => ({
    generatedAt: "2026-08-31T09:05:00.000Z",
    monthLabel: "August 2026",
    monthStart: "2026-08-01",
    trackingSince: null,
    liveModels: 1,
    liveHosts: 1,
    changesTotal: 0,
    increases: 0,
    decreases: 0,
    newListings: 0,
    newModels: 0,
    topIncreases: [],
    topDecreases: [],
    repricers: [],
    spreads: [],
    multiHostModels: 0,
    medianHostsPerModel: 1,
    maxHostsPerModel: 1,
    hostBuckets: [],
    bandWinners: [],
    saturation: [],
  }),
}));

import { Route } from "../live";

const GET = (Route.options as any).server.handlers.GET as (ctx: {
  request: Request;
}) => Promise<Response>;

describe("GET /api/public/og/intelligence/live", () => {
  it("404s with 'Unknown card' for a card id absent from the live payload", async () => {
    const res = await GET({
      request: new Request(
        "https://www.costmyai.com/api/public/og/intelligence/live?card=spread-not-a-real-model",
      ),
    });

    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Unknown card");
  });
});
