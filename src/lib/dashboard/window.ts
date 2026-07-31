import type { RangeDays } from "../dashboard.server";

/**
 * Period selection, in one place.
 *
 * The regression this module exists to prevent: the money figures scaled with
 * the 24h/7d/30d toggle while the lists underneath them silently did not. Every
 * list the dashboard renders now goes through a selector here, so "the toggle
 * applies to everything" is a property of one tested module rather than a habit
 * that has to be remembered at each query site.
 */

export const DAY_MS = 86_400_000;

export interface PeriodWindow {
  /** Inclusive ISO lower bound of the selected window. */
  start: string;
  /** Inclusive ISO lower bound of the preceding, equally long comparison window. */
  previousStart: string;
  days: RangeDays;
}

export function rangeWindow(days: RangeDays, nowMs: number): PeriodWindow {
  return {
    start: new Date(nowMs - days * DAY_MS).toISOString(),
    previousStart: new Date(nowMs - 2 * days * DAY_MS).toISOString(),
    days,
  };
}

/** Splits rollups into the selected window and the comparison window before it. */
export function partitionRollups<T extends { bucket_start: string }>(
  rows: T[],
  w: PeriodWindow,
): { current: T[]; previous: T[] } {
  const current: T[] = [];
  const previous: T[] = [];
  for (const r of rows) {
    if (r.bucket_start >= w.start) current.push(r);
    else if (r.bucket_start >= w.previousStart) previous.push(r);
  }
  return { current, previous };
}

/**
 * A switch belongs to the window it was activated in. A switch that started
 * rerouting three weeks ago is not something that happened "in the last 24
 * hours", and its cumulative saving is not a 24-hour saving either.
 */
export function selectSwitchesInWindow<T extends { activated_at: string }>(
  rows: T[],
  w: PeriodWindow,
): T[] {
  return rows.filter((r) => r.activated_at >= w.start);
}

/**
 * A billing period is only shown when the whole period sits inside the window.
 * A 1–31 July invoice is not evidence about the last 24 hours, and showing it
 * there would be exactly the mismatch this module was written to kill.
 */
export function selectCapturesInWindow<T extends { period_start: string; period_end: string }>(
  rows: T[],
  w: PeriodWindow,
): T[] {
  const startDate = w.start.slice(0, 10);
  return rows.filter((r) => r.period_start >= startDate);
}
