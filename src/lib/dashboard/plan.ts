import { KIND_MIN_PLAN, PLAN_ORDER, planAtLeast, type PlanTier, type RecKind } from "../engine/types";

/**
 * Plan gating for the dashboard.
 *
 * Locked levels are not hidden and are not faked: the engine still runs the
 * check over the workspace's real traffic, and the locked card shows the true
 * number of findings and the true money behind them. Only the row-level detail
 * is withheld, which is the thing the upgrade actually buys.
 */

export const levelOrder: RecKind[] = ["host_arbitrage", "quality_match", "rightsize"];

export interface Gated<T> {
  kind: RecKind;
  requiredPlan: PlanTier;
  unlocked: boolean;
  /** Rows to render. Empty for a locked level — nothing leaks past the paywall. */
  items: T[];
  /** Real count of findings behind the lock. Zero when unlocked. */
  lockedCount: number;
  /** Real monthly money behind the lock. Zero when unlocked. */
  lockedMonthly: number;
  /** Monthly money the current plan can actually act on. */
  unlockedMonthly: number;
}

export function gateLevel<T>(
  kind: RecKind,
  plan: PlanTier,
  items: T[],
  valueOf: (item: T) => number,
): Gated<T> {
  const requiredPlan = KIND_MIN_PLAN[kind];
  const unlocked = planAtLeast(plan, requiredPlan);
  const total = items.reduce((s, i) => s + valueOf(i), 0);
  return {
    kind,
    requiredPlan,
    unlocked,
    items: unlocked ? items : [],
    lockedCount: unlocked ? 0 : items.length,
    lockedMonthly: unlocked ? 0 : total,
    unlockedMonthly: unlocked ? total : 0,
  };
}

/** The next plan up from the current one, or null at the top. */
export function nextPlan(plan: PlanTier): PlanTier | null {
  return PLAN_ORDER[PLAN_ORDER.indexOf(plan) + 1] ?? null;
}
