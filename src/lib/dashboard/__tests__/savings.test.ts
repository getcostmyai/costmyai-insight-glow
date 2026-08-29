import { describe, expect, it } from "vitest";

import { aggregateSavings, capturedInWindow } from "../savings";

/**
 * The audit this file locks down: shorter periods produced larger money, and
 * one workload's saving was counted once per list it appeared in.
 */

describe("aggregateSavings — one workload, one saving", () => {
  it("keeps only the best switch for a workload that appears in two lists", () => {
    const t = aggregateSavings([
      { key: "gpt-5.5|azure|generation", saving: 120, unlocked: true, qualityDelta: null }, // arbitrage
      { key: "gpt-5.5|azure|generation", saving: 300, unlocked: true, qualityDelta: 8 }, // quality match
      { key: "qwen3-32b|groq|classification", saving: 40, unlocked: true, qualityDelta: 6 },
    ]);
    expect(t.available).toBe(340);
    expect(t.gross).toBe(460);
    expect(t.overlapUsd).toBe(120);
    expect(t.overlapCount).toBe(1);
    expect(t.certifiedCount).toBe(2);
  });

  it("counts a locked finding only for what it adds over what you can already do", () => {
    const t = aggregateSavings([
      { key: "w1", saving: 100, unlocked: true, qualityDelta: null },
      { key: "w1", saving: 250, unlocked: false, qualityDelta: 12 },
      { key: "w2", saving: 80, unlocked: false, qualityDelta: 7 },
      { key: "w3", saving: 60, unlocked: false, qualityDelta: 3 }, // smaller than nothing unlocked → full
    ]);
    expect(t.available).toBe(100);
    expect(t.locked).toBe(150 + 80 + 60);
  });

  it("ignores non-positive candidates", () => {
    expect(aggregateSavings([{ key: "w", saving: 0, unlocked: true, qualityDelta: null }]).available).toBe(0);
  });
});

describe("capturedInWindow", () => {
  it("counts everything a switch younger than the window has saved", () => {
    expect(capturedInWindow([{ saved: 90, activeDays: 3 }], 7)).toBe(90);
  });

  it("allocates an older switch's observed saving across the window only", () => {
    // 300 over 30 days, asked about 7 → 70. Measured money, allocated; never grown.
    expect(capturedInWindow([{ saved: 300, activeDays: 30 }], 7)).toBe(70);
    expect(capturedInWindow([{ saved: 300, activeDays: 30 }], 1)).toBe(10);
  });

  it("never reports more on a shorter window than a longer one", () => {
    const s = [
      { saved: 300, activeDays: 30 },
      { saved: 40, activeDays: 2 },
    ];
    const d30 = capturedInWindow(s, 30);
    const d7 = capturedInWindow(s, 7);
    const d1 = capturedInWindow(s, 1);
    expect(d30).toBeGreaterThanOrEqual(d7);
    expect(d7).toBeGreaterThanOrEqual(d1);
  });
});
