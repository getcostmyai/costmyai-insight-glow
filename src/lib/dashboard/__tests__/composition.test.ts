import { describe, expect, it } from "vitest";

import {
  buildComposition,
  compositionBalances,
  compositionSentence,
} from "@/lib/dashboard/composition";

describe("level composition", () => {
  it("accounts for every candidate Govern looked at", () => {
    const c = buildComposition({
      arbitrageCount: 6,
      qualityCount: 2,
      oversizedCount: 2,
      eligibleCount: 8,
      refusedCount: 2,
    });
    expect(c.consideredCount).toBe(10);
    expect(c.eligibleCount + c.refusedCount).toBe(c.consideredCount);
    expect(compositionBalances(c)).toBe(true);
  });

  it("never considers more candidates than the levels found", () => {
    const c = buildComposition({
      arbitrageCount: 1,
      qualityCount: 0,
      oversizedCount: 0,
      eligibleCount: 3,
      refusedCount: 1,
    });
    expect(compositionBalances(c)).toBe(false);
  });

  it("states the rule in one sentence", () => {
    const c = buildComposition({
      arbitrageCount: 6,
      qualityCount: 2,
      oversizedCount: 2,
      eligibleCount: 8,
      refusedCount: 2,
    });
    expect(compositionSentence(c)).toContain("6 cheaper-host, 2 quality-matched, 2 oversized");
    expect(compositionSentence(c)).toContain("8 that clear the autonomous gate and 2 held for you");
  });
});
