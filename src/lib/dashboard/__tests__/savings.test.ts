import { describe, expect, it } from "vitest";

import { aggregateSavings, capturedInWindow, planLadder, type SavingCandidate } from "../savings";

/**
 * The audit this file locks down: shorter periods produced larger money, one
 * workload's saving was counted once per list it appeared in, and the three
 * mechanisms were treated as competing views of the same dollars when in fact
 * the quality and right-size figures are increments measured from the cheapest
 * host for the model the workload already runs on.
 */

const c = (
  key: string,
  kind: SavingCandidate["kind"],
  saving: number,
  unlocked = true,
): SavingCandidate => ({
  key,
  kind,
  saving,
  unlocked,
  qualityDelta: kind === "host_arbitrage" ? null : 4,
});

describe("aggregateSavings — one workload, one composed saving", () => {
  it("adds the arbitrage saving and the certified increment on the same workload", () => {
    // Paying 100, cheapest host 50, certified destination 5. Worth 95.
    const t = aggregateSavings([
      c("w1", "host_arbitrage", 50),
      c("w1", "quality_match", 45),
    ]);
    expect(t.available).toBe(95);
    expect(t.gross).toBe(95);
    expect(t.overlapUsd).toBe(0);
    expect(t.overlapCount).toBe(1);
    expect(t.certifiedCount).toBe(1);
  });

  it("counts only the larger increment when quality and rightsize both fire", () => {
    const t = aggregateSavings([
      c("w1", "host_arbitrage", 50),
      c("w1", "quality_match", 30),
      c("w1", "rightsize", 40),
    ]);
    expect(t.available).toBe(90);
    // The discarded alternative is the overlap the naive sum would have added.
    expect(t.gross).toBe(120);
    expect(t.overlapUsd).toBe(30);
  });

  it("keeps only the best row when one mechanism offers two", () => {
    const t = aggregateSavings([
      c("w1", "quality_match", 30),
      c("w1", "quality_match", 45),
    ]);
    expect(t.available).toBe(45);
  });

  it("counts a locked finding only for what it adds over what you can already do", () => {
    const t = aggregateSavings([
      c("w1", "host_arbitrage", 100, true),
      c("w1", "quality_match", 250, false),
      c("w2", "rightsize", 80, false),
    ]);
    // Reachable today: the 100 host swap. A higher plan adds the 250 increment.
    expect(t.available).toBe(100);
    expect(t.locked).toBe(250 + 80);
  });

  it("ignores non-positive candidates", () => {
    expect(aggregateSavings([c("w", "host_arbitrage", 0)]).available).toBe(0);
  });
});

/**
 * Invariants. No fixed dollar figures: a small dataset is generated from
 * costs and destination prices, and the aggregation is checked against the
 * definition of what a saving is.
 */
interface Workload {
  key: string;
  cost: number;
  baseline: number;
  quality: number | null;
  rightsize: number | null;
}

const dataset = (seed: number): Workload[] => {
  let s = seed;
  const rnd = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  return Array.from({ length: 12 }, (_, i) => {
    const cost = 20 + Math.round(rnd() * 500);
    const baseline = Math.round(cost * (0.4 + rnd() * 0.6));
    const hasQ = rnd() > 0.35;
    const hasR = rnd() > 0.5;
    return {
      key: `w${i}`,
      cost,
      baseline,
      quality: hasQ ? Math.round(baseline * (0.2 + rnd() * 0.7)) : null,
      rightsize: hasR ? Math.round(baseline * (0.2 + rnd() * 0.7)) : null,
    };
  });
};

const candidatesFor = (w: Workload, unlocked = true): SavingCandidate[] => {
  const out: SavingCandidate[] = [];
  if (w.cost - w.baseline > 0) out.push(c(w.key, "host_arbitrage", w.cost - w.baseline, unlocked));
  if (w.quality !== null && w.baseline - w.quality > 0)
    out.push(c(w.key, "quality_match", w.baseline - w.quality, unlocked));
  if (w.rightsize !== null && w.baseline - w.rightsize > 0)
    out.push(c(w.key, "rightsize", w.baseline - w.rightsize, unlocked));
  return out;
};

/** The destination actually recommended: the cheapest one reachable. */
const destinationCost = (w: Workload) => {
  const options = [w.cost, w.baseline];
  if (w.quality !== null) options.push(w.quality);
  if (w.rightsize !== null) options.push(w.rightsize);
  return Math.min(...options);
};

describe("composition invariants", () => {
  for (const seed of [1, 7, 42, 9001]) {
    it(`claims cost minus the recommended destination, per workload (seed ${seed})`, () => {
      for (const w of dataset(seed)) {
        const t = aggregateSavings(candidatesFor(w));
        expect(t.available).toBeCloseTo(w.cost - destinationCost(w), 2);
      }
    });

    it(`the plan ladder increments sum to the workspace total (seed ${seed})`, () => {
      const ws = dataset(seed);
      const all = ws.flatMap((w) => candidatesFor(w));
      const l = planLadder(all);
      const t = aggregateSavings(all);
      expect(l.compareReach + l.certifyIncrement + l.rightsizeIncrement).toBeCloseTo(
        t.available + t.locked,
        2,
      );
      expect(l.certifyReach).toBeCloseTo(l.compareReach + l.certifyIncrement, 2);
      expect(l.rightsizeReach).toBeCloseTo(l.certifyReach + l.rightsizeIncrement, 2);
    });

    it(`holds the same on a plan that has not unlocked the later levels (seed ${seed})`, () => {
      const ws = dataset(seed);
      const all = ws.flatMap((w) => {
        const rows = candidatesFor(w);
        return rows.map((r) => ({ ...r, unlocked: r.kind === "host_arbitrage" }));
      });
      const t = aggregateSavings(all);
      const l = planLadder(all);
      expect(t.available + t.locked).toBeCloseTo(l.rightsizeReach, 2);
      expect(t.available).toBeCloseTo(l.compareReach, 2);
    });

    it(`no workload contributes more than its own composed value (seed ${seed})`, () => {
      const ws = dataset(seed);
      const all = ws.flatMap((w) => candidatesFor(w));
      const t = aggregateSavings(all);
      const perWorkload = ws.reduce((s, w) => s + (w.cost - destinationCost(w)), 0);
      expect(t.available + t.locked).toBeCloseTo(perWorkload, 2);
    });

    it(`the Certify increment is neither negative nor larger than the certified savings (seed ${seed})`, () => {
      const ws = dataset(seed);
      const all = ws.flatMap((w) => candidatesFor(w));
      const l = planLadder(all);
      const certifiedSum = all
        .filter((r) => r.kind === "quality_match")
        .reduce((s, r) => s + r.saving, 0);
      expect(l.certifyIncrement).toBeGreaterThanOrEqual(0);
      expect(l.certifyIncrement).toBeLessThanOrEqual(certifiedSum + 0.01);
      expect(l.rightsizeIncrement).toBeGreaterThanOrEqual(0);
    });
  }
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
