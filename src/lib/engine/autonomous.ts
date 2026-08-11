import type { Recommendation } from "./types";

/**
 * Govern's autonomous gate.
 *
 * Audit finding C5: the old constant MIN_AUTONOMOUS_DELTA = 2.0 required the
 * replacement to be strictly BETTER by two points, which meant "equal-quality"
 * switches — the entire premise of Certify — could never fire autonomously.
 *
 * The correct gate overlaps the equivalence band: a switch is autonomously safe
 * when its quality delta sits at or above the measured margin boundary, i.e.
 * inside the band Certify already certified. Below that band it is not equal
 * quality and a human decides.
 */
export interface AutonomousPolicy {
  /** Minimum monthly saving before CostMyAI will act without a human. */
  minMonthlySavingUsd: number;
  /**
   * Dispatch 187. The exit side of the hysteresis band. A workload that is
   * already switched keeps its switch until the saving falls BELOW this, so a
   * candidate hovering on the $25 line cannot enter and leave repeatedly as
   * prices wobble by a cent. Entering costs $25/mo; leaving costs a fall to
   * under $20/mo. Cadence-independent by construction: the band is a value, not
   * a clock.
   */
  exitMonthlySavingUsd: number;
  /**
   * Dispatch 187. Once a workload has a live destination, a DIFFERENT
   * destination must beat it by this much, in percent of the incumbent's
   * monthly saving, before autonomy re-targets. Below it the two are a tie and
   * the incumbent keeps the traffic.
   */
  retargetImprovementPct: number;
  /** Minimum hours between autonomous changes to the same workload. */
  cooldownHours: number;
  /** Autonomous mode switched on for this workspace. */
  enabled: boolean;
}

export const DEFAULT_AUTONOMOUS_POLICY: AutonomousPolicy = {
  minMonthlySavingUsd: 25,
  exitMonthlySavingUsd: 20,
  retargetImprovementPct: 3,
  cooldownHours: 72,
  enabled: false,
};

/**
 * The workload identity the cooldown is scoped to.
 *
 * Dispatch 187: the same triple the database already uses for the
 * one-active-switch-per-workload constraint in `system_apply_switch`. An
 * org-wide cooldown froze seventeen unrelated workloads because one changed,
 * and left a single churning workload no better protected than before.
 */
export function workloadKey(orgId: string, fromModel: string, fromHost: string) {
  return `${orgId}|${fromModel}|${fromHost}`;
}

/** The destination a workload is already switched to, if any. */
export interface ActiveDestination {
  toModel: string;
  toHost: string;
  /** The incumbent's own monthly saving, as measured — never a projection. */
  monthlySavingUsd: number;
}

export type AutonomousVerdict =
  | { allowed: true }
  | {
      allowed: false;
      reason:
        | "disabled"
        | "not_equal_quality"
        | "unmeasured_margin"
        | "saving_below_policy"
        | "saving_below_exit_floor"
        | "retarget_below_improvement"
        | "cooldown_active";
      detail: string;
    };

export function evaluateAutonomous(
  rec: Recommendation,
  policy: AutonomousPolicy,
  ctx: {
    now: Date;
    /** Last unattended change to THIS workload, not to the workspace. */
    lastAutonomousChangeAt?: Date | null;
    /** What this workload is already switched to, when it is switched. */
    active?: ActiveDestination | null;
  },
): AutonomousVerdict {
  if (!policy.enabled) {
    return { allowed: false, reason: "disabled", detail: "Autonomous mode is off." };
  }

  if (rec.kind === "quality_match") {
    if (rec.marginUsed == null) {
      return {
        allowed: false,
        reason: "unmeasured_margin",
        detail: "No measured margin for this benchmark — refusing to act unattended.",
      };
    }
    // Inside the equivalence band (delta >= -margin) is enough. Strictly-better is not required.
    if ((rec.qualityDelta ?? Number.NEGATIVE_INFINITY) < -rec.marginUsed) {
      return {
        allowed: false,
        reason: "not_equal_quality",
        detail: `Quality delta ${rec.qualityDelta} falls outside the ±${rec.marginUsed} equivalence band.`,
      };
    }
  }

  const active = ctx.active ?? null;
  const holding =
    active != null && active.toModel === rec.toModel && active.toHost === rec.toHost;

  if (holding) {
    // The exit side of the band. Still worth at least the exit floor, so the
    // switch stays; a fall below it is what ends eligibility, not a dip under
    // the entry threshold.
    if (rec.monthlySavingUsd < policy.exitMonthlySavingUsd) {
      return {
        allowed: false,
        reason: "saving_below_exit_floor",
        detail: `$${rec.monthlySavingUsd}/mo has fallen under the $${policy.exitMonthlySavingUsd} hold floor for a switch that is already running.`,
      };
    }
  } else {
    if (rec.monthlySavingUsd < policy.minMonthlySavingUsd) {
      return {
        allowed: false,
        reason: "saving_below_policy",
        detail: `$${rec.monthlySavingUsd}/mo is under the $${policy.minMonthlySavingUsd} autonomous threshold.`,
      };
    }
    if (active) {
      // Re-targeting a live switch: beating the incumbent is not enough, it has
      // to beat it by a margin no ordinary price wobble reaches.
      const base = Math.abs(active.monthlySavingUsd);
      const improvementPct =
        base > 0
          ? ((rec.monthlySavingUsd - active.monthlySavingUsd) / base) * 100
          : rec.monthlySavingUsd > 0
            ? Number.POSITIVE_INFINITY
            : 0;
      if (improvementPct < policy.retargetImprovementPct) {
        return {
          allowed: false,
          reason: "retarget_below_improvement",
          detail: `${improvementPct.toFixed(1)}% better than the switch already running (${active.toModel} on ${active.toHost}); re-targeting needs ${policy.retargetImprovementPct}%.`,
        };
      }
    }
  }

  if (ctx.lastAutonomousChangeAt) {
    const elapsedHours =
      (ctx.now.getTime() - ctx.lastAutonomousChangeAt.getTime()) / (1000 * 60 * 60);
    if (elapsedHours < policy.cooldownHours) {
      return {
        allowed: false,
        reason: "cooldown_active",
        detail: `${elapsedHours.toFixed(1)}h since this workload's last autonomous change; cooldown is ${policy.cooldownHours}h.`,
      };
    }
  }

  return { allowed: true };
}

