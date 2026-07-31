import { describe, expect, it } from "vitest";

import {
  formatRate,
  formatRateRange,
  formatThreshold,
  toLadder,
  type PartnerTierRow,
} from "@/lib/partner-tiers";

const ROWS: PartnerTierRow[] = [
  { tier: 2, name: "Silver", minLifetimeUsd: 10000, ratePct: 25 },
  { tier: 0, name: "Starter", minLifetimeUsd: 0, ratePct: 15 },
  { tier: 4, name: "Platinum", minLifetimeUsd: 130000, ratePct: 35 },
];

describe("partner commission ladder", () => {
  it("orders rungs by tier regardless of row order", () => {
    expect(toLadder(ROWS).tiers.map((t) => t.name)).toEqual(["Starter", "Silver", "Platinum"]);
  });

  it("derives the headline range from the rows, not from copy", () => {
    expect(formatRateRange(toLadder(ROWS))).toBe("15–35%");
  });

  it("tracks a changed ladder instead of restating today's numbers", () => {
    const changed = ROWS.map((r) => ({ ...r, ratePct: r.ratePct + 5 }));
    expect(formatRateRange(toLadder(changed))).toBe("20–40%");
  });

  it("collapses to a single rate when the ladder has one rung", () => {
    expect(formatRateRange(toLadder([ROWS[1]!]))).toBe("15%");
  });

  it("returns null for an empty ladder so the page states no rate at all", () => {
    const empty = toLadder([]);
    expect(empty.tiers).toEqual([]);
    expect(formatRateRange(empty)).toBeNull();
  });

  it("formats thresholds compactly without inventing precision", () => {
    expect(formatThreshold(0)).toBe("$0");
    expect(formatThreshold(500)).toBe("$500");
    expect(formatThreshold(5000)).toBe("$5K");
    expect(formatThreshold(130000)).toBe("$130K");
    expect(formatThreshold(1500)).toBe("$1.5K");
    expect(formatThreshold(1_200_000)).toBe("$1.2M");
  });

  it("formats rates without trailing zeros but keeps real fractions", () => {
    expect(formatRate(15)).toBe("15%");
    expect(formatRate(17.5)).toBe("17.5%");
  });
});
