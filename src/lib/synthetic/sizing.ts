import { costOf, DAYS_IN_MONTH } from "@/lib/engine/cost";
import type { PriceRow } from "@/lib/engine/types";

import { DAY_MS, lognormalSigma } from "./generator";
import { DEFAULT_RAMP_DAYS, type SyntheticWorkload } from "./workloads";

/**
 * Volume sizing.
 *
 * A workload declares what share of the bill it represents, never how many
 * requests it makes. The request rate is solved for, per model, against the
 * live synced price in `host_prices`:
 *
 *     requests/day = (share x target monthly spend / 30) / cost of one request
 *
 * so the same $17.5k ecosystem is a couple of dozen calls a day on o1-pro and
 * tens of thousands on a $0.29/Mtok classifier. Scaling every workload by a
 * flat multiplier would have hit the same total while quietly misrepresenting
 * how AI spend actually concentrates.
 */

/** Midpoint of the specified $15k-$20k monthly range. */
export const TARGET_MONTHLY_SPEND_USD = 17_500;

/**
 * Expected token count for a log-normal draw. The median is not the mean: a
 * right-skewed distribution bills above its median, and sizing against the
 * median would systematically undershoot the target.
 */
export function expectedTokens(median: number, p95: number): number {
  const sigma = lognormalSigma(median, p95);
  return median * Math.exp((sigma * sigma) / 2);
}

/** How present a workload is at a given moment, 0 (absent) to 1 (fully ramped). */
export function lifecycleFactor(daysAgo: number, workload: SyntheticWorkload): number {
  const lc = workload.lifecycle;
  if (!lc) return 1;
  const ramp = Math.max(lc.rampDays ?? DEFAULT_RAMP_DAYS, 0.5);
  let factor = 1;

  if (lc.introducedDaysAgo !== undefined) {
    // Not yet adopted, then a week-long ramp to steady state.
    const elapsed = lc.introducedDaysAgo - daysAgo;
    factor *= clamp01(elapsed / ramp);
  }
  if (lc.retiringSinceDaysAgo !== undefined) {
    const elapsed = lc.retiringSinceDaysAgo - daysAgo;
    factor *= 1 - clamp01(elapsed / ramp);
  }
  return factor;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * Mean lifecycle presence across the window. A workload that only existed for
 * the last five days must run hotter on those days to contribute the share of
 * the bill it is meant to contribute, otherwise the target is missed by
 * whatever the ramps removed.
 */
export function activeFraction(workload: SyntheticWorkload, windowDays: number): number {
  let sum = 0;
  for (let d = 0; d < windowDays; d++) sum += lifecycleFactor(windowDays - 0.5 - d, workload);
  return sum / windowDays;
}

export interface SizedWorkload extends SyntheticWorkload {
  /** Steady-state requests per day, before the traffic curve and lifecycle ramp. */
  requestsPerDay: number;
  /** Expected cost of a single request at the live price. */
  costPerRequestUsd: number;
  /** Spend this workload is sized to contribute over a 30-day month. */
  targetMonthlyUsd: number;
}

export interface SizeOptions {
  windowDays?: number;
  targetMonthlyUsd?: number;
}

/**
 * Solve every workload's request rate against live pricing. Refuses rather than
 * guesses when a model/host pair has no synced price — an uncosted workload
 * would put fabricated spend on the dashboard.
 */
export function sizeWorkloads(
  workloads: SyntheticWorkload[],
  priceFor: (modelKey: string, host: string) => PriceRow | undefined,
  { windowDays = DAYS_IN_MONTH, targetMonthlyUsd = TARGET_MONTHLY_SPEND_USD }: SizeOptions = {},
): SizedWorkload[] {
  const shareTotal = workloads.reduce((s, w) => s + w.spendShare, 0);

  return workloads.map((w) => {
    const price = priceFor(w.modelKey, w.host);
    if (!price) {
      throw new Error(
        `No live price for ${w.modelKey}@${w.host} — refusing to size a workload whose cost cannot be computed.`,
      );
    }
    const inTokens = expectedTokens(w.inputP50, w.inputP50 * w.inputSpread);
    const outTokens = expectedTokens(w.outputP50, w.outputP95);
    // Failed calls consume input tokens and return none.
    const costPerRequestUsd = costOf(price, inTokens, outTokens * (1 - w.errorRate));

    const targetMonthlyUsd_ = (targetMonthlyUsd * w.spendShare) / shareTotal;
    const active = Math.max(activeFraction(w, windowDays), 1 / windowDays);
    const requestsPerDay = targetMonthlyUsd_ / DAYS_IN_MONTH / costPerRequestUsd / active;

    return {
      ...w,
      requestsPerDay: Math.max(1, Math.round(requestsPerDay)),
      costPerRequestUsd,
      targetMonthlyUsd: targetMonthlyUsd_,
    };
  });
}

/** Convenience: the day offset of a timestamp relative to the window end. */
export function daysAgoOf(at: Date, windowEnd: Date): number {
  return (windowEnd.getTime() - at.getTime()) / DAY_MS;
}
