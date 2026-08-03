import type { HeadcountBand, RevenueBand, UseCase } from "./taxonomy";

/**
 * Lightweight sanity check at the point of entry.
 *
 * These fields are self-reported and optional, so the realistic failure mode is
 * not a lie, it is a shrug. This never blocks anyone: it says out loud when a
 * combination looks off, and it marks the row so an implausible answer cannot
 * quietly corrupt a bucket that other people's numbers depend on.
 */

export interface ProfileAnswers {
  revenueBand?: RevenueBand | null;
  headcountBand?: HeadcountBand | null;
  customerFacing?: boolean | null;
  maturity?: "pilot" | "production" | null;
  useCase?: UseCase | null;
}

export interface SanityVerdict {
  /** Human sentence to show inline. Null when nothing looks odd. */
  warning: string | null;
  /** Stored on the row so the aggregate can exclude it later if needed. */
  flag: "implausible_scale" | "conflicting_use_case" | null;
}

const HEAD_RANK: Record<HeadcountBand, number> = {
  "1_9": 0,
  "10_49": 1,
  "50_249": 2,
  "250_999": 3,
  "1000_plus": 4,
};

const REV_RANK: Record<RevenueBand, number> = {
  pre_revenue: 0,
  lt_1m: 1,
  "1m_10m": 2,
  "10m_50m": 3,
  "50m_250m": 4,
  gt_250m: 5,
};

export function checkAnswers(a: ProfileAnswers): SanityVerdict {
  if (a.revenueBand && a.headcountBand) {
    const head = HEAD_RANK[a.headcountBand];
    const rev = REV_RANK[a.revenueBand];
    // A nine-person company at $250M+ and a thousand-person company at
    // pre-revenue are both possible and both worth a second look.
    if (head <= 1 && rev >= 4) {
      return {
        warning:
          "That is a large revenue band for a team this size. Worth a second look before you save it, so your benchmark compares you to the right companies.",
        flag: "implausible_scale",
      };
    }
    if (head >= 3 && rev <= 1) {
      return {
        warning:
          "That is a small revenue band for a team this size. Worth a second look before you save it, so your benchmark compares you to the right companies.",
        flag: "implausible_scale",
      };
    }
  }

  if (a.useCase === "internal" && a.customerFacing === true) {
    return {
      warning:
        "At signup you said your AI is internal only. Saving this updates that to customer-facing.",
      flag: "conflicting_use_case",
    };
  }
  if (a.useCase === "customer_facing" && a.customerFacing === false) {
    return {
      warning:
        "At signup you said your AI is customer-facing. Saving this updates that to internal only.",
      flag: "conflicting_use_case",
    };
  }

  return { warning: null, flag: null };
}
