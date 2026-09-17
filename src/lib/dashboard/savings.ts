/**
 * How the money on the dashboard is added up — in one place, once.
 *
 * Three rules this module exists to enforce, all of which were violated before:
 *
 * 1. A period figure is a real sum of what happened inside that period. It is
 *    never a daily rate multiplied back out to a month, which is how the 7-day
 *    tab came to show a larger "available" number than the 30-day tab.
 * 2. One workload can only be saved once. Arbitrage, the quality check and the
 *    right-size check all run over the same traffic, so the same workload can
 *    appear in two or three lists.
 * 3. Those three figures do not measure the same dollars. Every mechanism
 *    prices against the same baseline: the cheapest host for the model the
 *    workload runs on today. Arbitrage is (today's cost minus that baseline).
 *    The quality and right-size figures are (that baseline minus their own
 *    destination), so they are increments that sit on top of arbitrage rather
 *    than alternatives to it. Keeping only the largest candidate therefore
 *    threw away real money. The quality destination and the right-size
 *    destination ARE alternatives to each other, so only the larger of those
 *    two increments may be counted.
 *
 * Per workload: arbitrage saving, plus the single largest increment among the
 * mechanisms that fired on it.
 */

export type MechanismKind = "host_arbitrage" | "quality_match" | "rightsize";

export interface SavingCandidate {
  /** Workload identity: model | host | task. The unit a switch applies to. */
  key: string;
  /** Which check produced this candidate. Decides how it composes. */
  kind: MechanismKind;
  /** Real dollars saved over the selected window. Never a run-rate. */
  saving: number;
  /** False when the finding is real but behind a higher plan. */
  unlocked: boolean;
  /**
   * The measured quality-equivalence claim behind this candidate, or null
   * where the mechanism makes no such claim (host arbitrage is same-model,
   * zero quality risk by construction; rightsize is governed by its own
   * required-tier gate). Carried for traceability only — headline
   * eligibility for quality_match candidates is enforced by the caller
   * BEFORE construction (dashboard.server.ts), never re-checked here.
   */
  qualityDelta: number | null;
}

export interface SavingsTotals {
  /** Composed value of every workload, using only what this plan can reach. */
  available: number;
  /** What a higher plan would add on top, per workload — never double-counted. */
  locked: number;
  /** Naive sum of every list, kept only so the overlap can be stated. */
  gross: number;
  /** Money that a naive sum would have counted twice. */
  overlapUsd: number;
  /** Workloads that appear in more than one list. */
  overlapCount: number;
  /** Workloads with at least one unlocked candidate worth money. */
  certifiedCount: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

interface Bucket {
  /** Best arbitrage saving, unlocked / any. */
  arbUnlocked: number;
  arbAny: number;
  /** Best increment (quality or rightsize, whichever is larger), unlocked / any. */
  incUnlocked: number;
  incAny: number;
  n: number;
}

const emptyBucket = (): Bucket => ({
  arbUnlocked: 0,
  arbAny: 0,
  incUnlocked: 0,
  incAny: 0,
  n: 0,
});

/**
 * The composed value of one workload: arbitrage plus the best increment.
 * Exported so callers that need the same rule on their own rows (Govern's
 * autonomous list, the plan ladder) cannot invent a second one.
 */
export function composeWorkload(arbitrage: number, increments: number[]): number {
  const best = increments.reduce((m, v) => (v > m ? v : m), 0);
  return Math.max(0, arbitrage) + Math.max(0, best);
}

export function aggregateSavings(candidates: SavingCandidate[]): SavingsTotals {
  const byWorkload = new Map<string, Bucket>();
  let gross = 0;

  for (const c of candidates) {
    if (c.saving <= 0) continue;
    gross += c.saving;
    const row = byWorkload.get(c.key) ?? emptyBucket();
    row.n += 1;
    if (c.kind === "host_arbitrage") {
      row.arbAny = Math.max(row.arbAny, c.saving);
      if (c.unlocked) row.arbUnlocked = Math.max(row.arbUnlocked, c.saving);
    } else {
      row.incAny = Math.max(row.incAny, c.saving);
      if (c.unlocked) row.incUnlocked = Math.max(row.incUnlocked, c.saving);
    }
    byWorkload.set(c.key, row);
  }

  let available = 0;
  let locked = 0;
  let certifiedCount = 0;
  let overlapCount = 0;
  let kept = 0;

  for (const row of byWorkload.values()) {
    const reachable = composeWorkload(row.arbUnlocked, [row.incUnlocked]);
    const everything = composeWorkload(row.arbAny, [row.incAny]);
    available += reachable;
    // Only the increment a higher plan would add on top of what is already
    // reachable. Never the locked candidate's whole figure.
    locked += Math.max(0, everything - reachable);
    kept += everything;
    if (reachable > 0) certifiedCount += 1;
    if (row.n > 1) overlapCount += 1;
  }

  return {
    available: round2(available),
    locked: round2(locked),
    gross: round2(gross),
    overlapUsd: round2(gross - kept),
    overlapCount,
    certifiedCount,
  };
}

/**
 * What running switches actually saved inside the window.
 *
 * A switch stores one cumulative figure since activation. For a window shorter
 * than its life we allocate that observed saving evenly across the days it has
 * been running — an allocation of measured money, not an extrapolation beyond
 * it. A switch younger than the window contributes everything it has saved.
 */
export function capturedInWindow(
  switches: { saved: number; activeDays: number }[],
  windowDays: number,
): number {
  let total = 0;
  for (const s of switches) {
    const days = Math.max(1, s.activeDays);
    total += s.saved * (Math.min(days, windowDays) / days);
  }
  return round2(total);
}

export interface PlanLadder {
  /** Compare's reach: the arbitrage saving, best row per workload. */
  compareReach: number;
  /** Compare plus the certified increment per workload. */
  certifyReach: number;
  /** Compare plus the larger of the certified and right-size increments. */
  rightsizeReach: number;
  /** certifyReach minus compareReach. */
  certifyIncrement: number;
  /** rightsizeReach minus certifyReach. Zero where rightsize adds nothing. */
  rightsizeIncrement: number;
}

/**
 * What each level adds over the level below it, under the same composition
 * rule. Plan-independent on purpose: an upsell card states what a workspace
 * would gain by upgrading, so it must describe the finding, not the gate.
 */
export function planLadder(candidates: SavingCandidate[]): PlanLadder {
  const byWorkload = new Map<string, { arb: number; quality: number; rightsize: number }>();
  for (const c of candidates) {
    if (c.saving <= 0) continue;
    const row = byWorkload.get(c.key) ?? { arb: 0, quality: 0, rightsize: 0 };
    if (c.kind === "host_arbitrage") row.arb = Math.max(row.arb, c.saving);
    else if (c.kind === "quality_match") row.quality = Math.max(row.quality, c.saving);
    else row.rightsize = Math.max(row.rightsize, c.saving);
    byWorkload.set(c.key, row);
  }

  let compareReach = 0;
  let certifyReach = 0;
  let rightsizeReach = 0;
  for (const row of byWorkload.values()) {
    compareReach += row.arb;
    certifyReach += composeWorkload(row.arb, [row.quality]);
    rightsizeReach += composeWorkload(row.arb, [row.quality, row.rightsize]);
  }

  return {
    compareReach: round2(compareReach),
    certifyReach: round2(certifyReach),
    rightsizeReach: round2(rightsizeReach),
    certifyIncrement: round2(certifyReach - compareReach),
    rightsizeIncrement: round2(rightsizeReach - certifyReach),
  };
}
