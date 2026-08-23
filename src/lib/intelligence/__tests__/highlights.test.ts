import { describe, expect, it } from "vitest";

import type { IntelligencePayload } from "../intelligence.server";
import { directionLine, numberOfTheMonth, postDraft, trackingWindow } from "../highlights";

const base = (over: Partial<IntelligencePayload> = {}): IntelligencePayload =>
  ({
    generatedAt: "2026-08-23T00:00:00.000Z",
    monthLabel: "August 2026",
    monthStart: "2026-08-01",
    trackingSince: "2026-06-14T00:00:00.000Z",
    liveModels: 10,
    liveHosts: 4,
    changesTotal: 10,
    increases: 4,
    decreases: 6,
    newListings: 2,
    newModels: 1,
    topIncreases: [],
    topDecreases: [],
    repricers: [],
    spreads: [],
    multiHostModels: 3,
    medianHostsPerModel: 2,
    maxHostsPerModel: 4,
    hostBuckets: [],
    bandWinners: [],
    saturation: [],
    ...over,
  }) as IntelligencePayload;

const move = (pct: number) =>
  ({
    modelKey: "m",
    host: "h",
    hostLabel: "Host",
    pct,
    inputNow: 1,
    inputPrev: 2,
    outputNow: null,
    outputPrev: null,
  }) as never;

describe("numberOfTheMonth", () => {
  it("picks the largest magnitude, whatever its direction", () => {
    const pick = numberOfTheMonth(
      base({ topDecreases: [move(-12)], topIncreases: [move(31)] }),
    );
    expect(pick?.value).toBe("+31.0%");
    expect(pick?.tone).toBe("up");
  });

  it("prefers the cut when magnitudes tie, so the rule is reproducible", () => {
    const pick = numberOfTheMonth(base({ topDecreases: [move(-20)], topIncreases: [move(20)] }));
    expect(pick?.tone).toBe("down");
  });

  it("returns nothing when the month recorded nothing", () => {
    expect(numberOfTheMonth(base())).toBeNull();
  });
});

describe("directionLine", () => {
  it("states the balance and the share of cuts", () => {
    expect(directionLine(base())).toContain("6 cuts and 4 rises");
    expect(directionLine(base())).toContain("60% of all moves were cuts");
  });

  it("is silent when there were no moves", () => {
    expect(directionLine(base({ increases: 0, decreases: 0 }))).toBeNull();
  });
});

describe("trackingWindow", () => {
  it("states the real recording window in days", () => {
    expect(trackingWindow(base())).toContain("70-day window");
  });
});

describe("postDraft", () => {
  it("always carries the source line", () => {
    const text = postDraft({
      value: "-31.0%",
      label: "m at Host",
      detail: "Cut.",
      window: "Window.",
      url: "https://costmyai.com/intelligence/2026-07",
    });
    expect(text).toContain("Source: CostMyAI Intelligence.");
    expect(text).toContain("Window.");
  });
});
