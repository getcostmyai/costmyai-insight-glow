import { describe, expect, it } from "vitest";

import { gateLevel, levelOrder, type Gated } from "../plan";

/**
 * Before this module the dashboard rendered every level unconditionally: a
 * Compare-plan workspace saw the full Rightsize list as if it had paid for it.
 * Gating has to be real (locked levels show a true count and a true total, never
 * fabricated teaser content) and it has to be honest about the money split.
 */

const arb = [
  { saving: 120, fromModel: "gpt-5.5" },
  { saving: 80, fromModel: "o1-pro" },
];
const quality = [{ saving: 300, fromModel: "claude-opus" }];
const oversized = [{ saving: 220, fromModel: "gpt-4" }];

const value = (r: { saving: number }) => r.saving;

describe("level gating", () => {
  it("unlocks host arbitrage on the free Compare plan", () => {
    const g = gateLevel("host_arbitrage", "compare", arb, value);
    expect(g.unlocked).toBe(true);
    expect(g.items).toHaveLength(2);
    expect(g.lockedSaving).toBe(0);
  });

  it("locks quality matching on Compare but keeps the real count and total", () => {
    const g = gateLevel("quality_match", "compare", quality, value);
    expect(g.unlocked).toBe(false);
    expect(g.items).toEqual([]); // no content leaks through the paywall
    expect(g.lockedCount).toBe(1); // the count is real, not invented
    expect(g.lockedSaving).toBe(300);
    expect(g.requiredPlan).toBe("certify");
  });

  it("locks the rightsize teaser on Certify and unlocks it on Rightsize", () => {
    expect(gateLevel("rightsize", "certify", oversized, value).unlocked).toBe(false);
    expect(gateLevel("rightsize", "certify", oversized, value).lockedSaving).toBe(220);

    const unlocked = gateLevel("rightsize", "rightsize", oversized, value);
    expect(unlocked.unlocked).toBe(true);
    expect(unlocked.items).toHaveLength(1);
    expect(unlocked.lockedSaving).toBe(0);
  });

  it("keeps everything unlocked on Govern", () => {
    for (const kind of levelOrder) {
      expect(gateLevel(kind, "govern", arb, value).unlocked).toBe(true);
    }
  });

  it("separates activatable money from money behind the paywall", () => {
    const gated: Gated<{ saving: number }>[] = [
      gateLevel("host_arbitrage", "compare", arb, value),
      gateLevel("quality_match", "compare", quality, value),
      gateLevel("rightsize", "compare", oversized, value),
    ];
    const available = gated.reduce((s, g) => s + g.unlockedSaving, 0);
    const locked = gated.reduce((s, g) => s + g.lockedSaving, 0);
    expect(available).toBe(200); // only the arbitrage rows the plan can act on
    expect(locked).toBe(520); // real, measured, and clearly labelled as locked
  });
});
