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
  /** Minimum hours between autonomous changes to the same workload. */
  cooldownHours: number;
  /** Autonomous mode switched on for this workspace. */
  enabled: boolean;
}

export const DEFAULT_AUTONOMOUS_POLICY: AutonomousPolicy = {
  minMonthlySavingUsd: 25,
  cooldownHours: 72,
  enabled: false,
};

export type AutonomousVerdict =
  | { allowed: true }
  | {
      allowed: false;
      reason:
        | "disabled"
        | "not_equal_quality"
        | "unmeasured_margin"
        | "saving_below_policy"
        | "cooldown_active";
      detail: string;
    };

export function evaluateAutonomous(
  rec: Recommendation,
  policy: AutonomousPolicy,
  ctx: { now: Date; lastAutonomousChangeAt?: Date | null },
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

  if (rec.monthlySavingUsd < policy.minMonthlySavingUsd) {
    return {
      allowed: false,
      reason: "saving_below_policy",
      detail: `$${rec.monthlySavingUsd}/mo is under the $${policy.minMonthlySavingUsd} autonomous threshold.`,
    };
  }

  if (ctx.lastAutonomousChangeAt) {
    const elapsedHours =
      (ctx.now.getTime() - ctx.lastAutonomousChangeAt.getTime()) / (1000 * 60 * 60);
    if (elapsedHours < policy.cooldownHours) {
      return {
        allowed: false,
        reason: "cooldown_active",
        detail: `${elapsedHours.toFixed(1)}h since the last autonomous change; cooldown is ${policy.cooldownHours}h.`,
      };
    }
  }

  return { allowed: true };
}
