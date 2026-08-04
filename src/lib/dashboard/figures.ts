import type { DashboardSnapshot } from "../dashboard.functions";

/**
 * Every figure that appears on more than one level page, derived once.
 *
 * Five pages render from one snapshot, but that alone never guaranteed they
 * agreed: each page used to re-derive "benchmark saving", "identified" and the
 * capture rate inline, and the copies did not all handle a locked level the
 * same way — Certify summed its (empty) row list and showed $0 where Overview
 * and Compare showed the real money behind the paywall. Anything shared now
 * comes from here, so a page cannot hold a private opinion about a number that
 * belongs to the whole workspace.
 */

export type MechanismKind = "host_arbitrage" | "quality_match" | "rightsize";

/**
 * Real dollars one check found over the selected window.
 *
 * Unlocked levels sum their own rows; locked levels have no rows by design and
 * report the true money the engine found behind the lock. This distinction is
 * the one every duplicated copy of this function used to get wrong.
 */
export function levelSaving(data: DashboardSnapshot, kind: MechanismKind): number {
  const level = data.levels[kind];
  if (!level.unlocked) return level.lockedSaving;
  if (kind === "host_arbitrage") return data.hostArbitrage.reduce((s, r) => s + r.saving, 0);
  if (kind === "quality_match") return data.qualityMatched.reduce((s, r) => s + r.saving, 0);
  return data.oversized.reduce((s, o) => s + o.wasted, 0);
}

/** Findings behind one check, locked or not — the count that pairs with levelSaving. */
export function levelCount(data: DashboardSnapshot, kind: MechanismKind): number {
  const level = data.levels[kind];
  if (!level.unlocked) return level.lockedCount;
  if (kind === "host_arbitrage") return data.hostArbitrage.length;
  if (kind === "quality_match") return data.qualityMatched.length;
  return data.oversized.length;
}

export interface CaptureFigures {
  /** available + captured. Everything this window identified. */
  identified: number;
  /** captured / identified, 0 when nothing was identified. */
  rate: number;
  /** The whole-percent form every hero prints. */
  pct: number;
}

/**
 * The capture ratio, in one place.
 *
 * Both sides are real sums over the same window, so the ratio is like-for-like
 * on every period tab, and Overview, Rightsize and Govern round it identically.
 */
export function captureFigures(savings: DashboardSnapshot["savings"]): CaptureFigures {
  const identified = savings.captured + savings.available;
  const rate = identified > 0 ? savings.captured / identified : 0;
  return { identified, rate, pct: Math.round(rate * 100) };
}

/** Certification rate — Certify's headline, Overview's step-2 detail. */
export function certificationRate(stats: DashboardSnapshot["stats"]): number {
  return stats.qualityEvaluated > 0
    ? (stats.qualityCertified / stats.qualityEvaluated) * 100
    : 0;
}
