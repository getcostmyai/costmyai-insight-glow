import { describe, expect, it, vi } from "vitest";

/**
 * The regression this pins is a live production failure, not a hypothetical:
 * when the renderer was slow, both OG routes answered with an SVG document, and
 * LinkedIn's crawler reported "No image found" to anyone sharing the page. The
 * contract now is that a render failure still produces real PNG bytes.
 */
vi.mock("@/lib/brand/render.server", () => ({
  esc: (s: string) => s,
  RENDER_TIMEOUT_MS: 4000,
  renderSvgToPng: async () => {
    throw new Error("renderer service is cold");
  },
}));

vi.mock("@/lib/intelligence/intelligence.server", () => ({
  readIntelligence: async () => ({
    generatedAt: "2026-08-31T09:05:00.000Z",
    monthLabel: "August 2026",
    monthStart: "2026-08-01",
    trackingSince: null,
    liveModels: 42,
    liveHosts: 9,
    changesTotal: 17,
    increases: 9,
    decreases: 8,
    newListings: 0,
    newModels: 0,
    topIncreases: [],
    topDecreases: [],
    repricers: [],
    spreads: [],
    multiHostModels: 3,
    medianHostsPerModel: 1,
    maxHostsPerModel: 4,
    hostBuckets: [],
    bandWinners: [],
    saturation: [],
  }),
}));

vi.mock("@/lib/intelligence/snapshot.server", async () => {
  const actual = await vi.importActual<any>("@/lib/intelligence/snapshot.server");
  return {
    ...actual,
    readFrozenMonth: async (month: string) => ({
      month,
      frozenAt: "2026-08-01T00:00:00.000Z",
      restated: false,
      note: null,
      payload: {
        generatedAt: "2026-07-31T23:59:00.000Z",
        monthLabel: "July 2026",
        monthStart: "2026-07-01",
        trackingSince: null,
        liveModels: 40,
        liveHosts: 8,
        changesTotal: 12,
        increases: 7,
        decreases: 5,
        newListings: 0,
        newModels: 0,
        topIncreases: [],
        topDecreases: [],
        repricers: [],
        spreads: [],
        multiHostModels: 2,
        medianHostsPerModel: 1,
        maxHostsPerModel: 3,
        hostBuckets: [],
        bandWinners: [],
        saturation: [],
      },
    }),
  };
});

import { Route as LiveRoute } from "@/routes/api/public/og/intelligence/live";
import { Route as MonthRoute } from "@/routes/api/public/og/intelligence/$month";

const liveGET = (LiveRoute.options as any).server.handlers.GET;
const monthGET = (MonthRoute.options as any).server.handlers.GET;

async function expectPng(res: Response) {
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("image/png");
  expect(res.headers.get("x-costmyai-render")).toBe("static-png-fallback");

  const bytes = new Uint8Array(await res.arrayBuffer());
  expect(bytes.length).toBeGreaterThan(1000);
  // PNG magic number. An SVG document would start with '<' (0x3c).
  expect(Array.from(bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
}

describe("OG image fallback when the renderer fails", () => {
  it("serves the static PNG on the live route", async () => {
    const res = await liveGET({
      request: new Request(
        "https://www.costmyai.com/api/public/og/intelligence/live?card=kpi-moves",
      ),
    });
    await expectPng(res);
    expect(res.headers.get("cache-control")).toBe("public, max-age=120");
  });

  it("serves the static PNG on the frozen month route", async () => {
    const res = await monthGET({
      request: new Request(
        "https://www.costmyai.com/api/public/og/intelligence/2026-07?card=kpi-moves",
      ),
      params: { month: "2026-07" },
    });
    await expectPng(res);
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
  });
});
