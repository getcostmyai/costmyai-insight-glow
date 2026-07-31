import { describe, expect, it } from "vitest";

import { gateRung, rungOrder, type Gated } from "../plan";

/**
 * Before this module the dashboard rendered every rung unconditionally: a
 * Compare-plan workspace saw the full Rightsize list as if it had paid for it.
 * Gating has to be real (locked rungs show a true count and a true total, never
 * fabricated teaser content) and it has to be honest about the money split.
 */

const arb = [
  { monthlySaving: 120, fromModel: "gpt-5.5" },
  { monthlySaving: 80, fromModel: "o1-pro" },
];
const quality = [{ monthlySaving: 300, fromModel: "claude-opus" }];
const oversized = [{ monthlySaving: 220, fromModel: "gpt-4" }];

const value = (r: { monthlySaving: number }) => r.monthlySaving;

describe("rung gating", () => {
  it("unlocks host arbitrage on the free Compare plan", () => {
    const g = gateRung("host_arbitrage", "compare", arb, value);
    expect(g.unlocked).toBe(true);
    expect(g.items).toHaveLength(2);
    expect(g.lockedMonthly).toBe(0);
  });

  it("locks quality matching on Compare but keeps the real count and total", () => {
    const g = gateRung("quality_match", "compare", quality, value);
    expect(g.unlocked).toBe(false);
    expect(g.items).toEqual([]); // no content leaks through the paywall
    expect(g.lockedCount).toBe(1); // the count is real, not invented
    expect(g.lockedMonthly).toBe(300);
    expect(g.requiredPlan).toBe("certify");
  });

  it("locks the rightsize teaser on Certify and unlocks it on Rightsize", () => {
    expect(gateRung("rightsize", "certify", oversized, value).unlocked).toBe(false);
    expect(gateRung("rightsize", "certify", oversized, value).lockedMonthly).toBe(220);

    const unlocked = gateRung("rightsize", "rightsize", oversized, value);
    expect(unlocked.unlocked).toBe(true);
    expect(unlocked.items).toHaveLength(1);
    expect(unlocked.lockedMonthly).toBe(0);
  });

  it("keeps everything unlocked on Govern", () => {
    for (const kind of rungOrder) {
      expect(gateRung(kind, "govern", arb, value).unlocked).toBe(true);
    }
  });

  it("separates activatable money from money behind the paywall", () => {
    const gated: Gated<{ monthlySaving: number }>[] = [
      gateRung("host_arbitrage", "compare", arb, value),
      gateRung("quality_match", "compare", quality, value),
      gateRung("rightsize", "compare", oversized, value),
    ];
    const available = gated.reduce((s, g) => s + g.unlockedMonthly, 0);
    const locked = gated.reduce((s, g) => s + g.lockedMonthly, 0);
    expect(available).toBe(200); // only the arbitrage rows the plan can act on
    expect(locked).toBe(520); // real, measured, and clearly labelled as locked
  });
});
