/**
 * How the money on the dashboard is added up — in one place, once.
 *
 * Two rules this module exists to enforce, both of which were violated before:
 *
 * 1. A period figure is a real sum of what happened inside that period. It is
 *    never a daily rate multiplied back out to a month, which is how the 7-day
 *    tab came to show a larger "available" number than the 30-day tab.
 * 2. One workload can only be saved once. Arbitrage, the quality check and the
 *    right-size check all run over the same traffic, so the same workload can
 *    appear in two or three lists. Summing the lists counts that workload's
 *    money two or three times, so the totals here keep the best candidate per
 *    workload and report the overlap they removed.
 */

export interface SavingCandidate {
  /** Workload identity: model | host | task. The unit a switch applies to. */
  key: string;
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
  /** Best unlocked switch per workload, summed. What you can act on today. */
  available: number;
  /** What a higher plan would add on top, per workload — never double-counted. */
  locked: number;
  /** Naive sum of every list, kept only so the overlap can be stated. */
  gross: number;
  /** Money that a naive sum would have counted twice. */
  overlapUsd: number;
  /** Workloads that appear in more than one list. */
  overlapCount: number;
  /** Workloads with at least one unlocked certified switch. */
  certifiedCount: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function aggregateSavings(candidates: SavingCandidate[]): SavingsTotals {
  const byWorkload = new Map<string, { unlocked: number; locked: number; n: number }>();
  let gross = 0;

  for (const c of candidates) {
    if (c.saving <= 0) continue;
    gross += c.saving;
    const row = byWorkload.get(c.key) ?? { unlocked: 0, locked: 0, n: 0 };
    row.n += 1;
    if (c.unlocked) row.unlocked = Math.max(row.unlocked, c.saving);
    else row.locked = Math.max(row.locked, c.saving);
    byWorkload.set(c.key, row);
  }

  let available = 0;
  let locked = 0;
  let certifiedCount = 0;
  let overlapCount = 0;
  let kept = 0;

  for (const row of byWorkload.values()) {
    available += row.unlocked;
    // Only the increment a higher plan would add: if the locked candidate saves
    // less than one you can already act on, upgrading buys nothing here.
    locked += Math.max(0, row.locked - row.unlocked);
    kept += Math.max(row.unlocked, row.locked);
    if (row.unlocked > 0) certifiedCount += 1;
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
