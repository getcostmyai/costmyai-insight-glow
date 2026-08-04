/**
 * Month-end spend forecasting.
 *
 * A wrong forecast is worse than a modest one. A flat 30-day-rate extrapolation
 * is confidently wrong on every workload shape that isn't constant: it ignores
 * what has already actually been spent this month, it smears a retired workload
 * across the rest of the month, and it reports a single hard number when the
 * data does not support one.
 *
 * The methodology here is deliberately standard, not invented:
 *
 *   1. Month-to-date actual is a fixed, known baseline — never re-estimated.
 *   2. Only the remaining days are projected, from a trailing 7-day level.
 *   3. Day-of-week factors from the trailing 28 days, applied only when the
 *      weekly pattern is real (max/min factor >= 1.25).
 *   4. A least-squares trend on the deseasonalised window, damped (phi = 0.5)
 *      and capped at +/-25%/day, so a short spike cannot compound into a month.
 *   5. A range instead of a point estimate when dispersion is high (cv > 0.15),
 *      width max(2 sigma, 6% of the point estimate).
 *   6. Structural breaks: a material workload that has gone silent is dropped
 *      from the level, and a workload that only appeared inside the trailing
 *      window forces a range. Either way the answer stays honest rather than
 *      confidently wrong.
 *
 * Everything below is pure. It takes daily per-workload spend and returns the
 * forecast plus the reasons behind it, so the UI can state its own basis.
 */

export interface ForecastInputRow {
  /** UTC calendar day, YYYY-MM-DD. */
  date: string;
  /** Workload identity — model|host|task. Structural breaks are per workload. */
  key: string;
  spend: number;
}

export interface ForecastOptions {
  /**
   * Calendar days inside the trailing window that the platform knows it did
   * not collect (no successful sync run). A hole here is a data-collection
   * fact, not a spend fact, and the forecast refuses rather than reads it
   * as quiet traffic.
   */
  syncGapDates?: string[];
  /**
   * Distinct hours of real collection per calendar day (YYYY-MM-DD -> 0..24).
   * A day under `minObservedHours` is a fragment of a day, not a cheap day,
   * and is dropped exactly like an absent day.
   */
  hourCoverage?: Record<string, number>;
  /**
   * First calendar day (inclusive) the hourly signal is actually complete for.
   * Hourly evidence has its own retention horizon; days before it are simply
   * unjudged rather than falsely called partial.
   */
  coverageReliableFrom?: string;
}


export interface MonthEndForecast {
  /** Month-to-date actual, complete days only. Known, not estimated. */
  mtdUsd: number;
  /** Point estimate for the full calendar month. Null when suppressed. */
  pointUsd: number | null;
  /** Present only when the data does not support a single number. */
  lowUsd: number | null;
  highUsd: number | null;
  isRange: boolean;
  /** True when no figure may be shown at all, with the reason beside it. */
  suppressed: boolean;
  suppressionReason: string | null;
  /** Days still to project, including today. */
  remainingDays: number;
  /** Trailing daily level used for the remaining days, deseasonalised. */
  dailyLevelUsd: number;
  /** Damped per-day trend actually applied. */
  trendPerDayUsd: number;
  seasonalityApplied: boolean;
  /** Coefficient of variation of the deseasonalised trailing window. */
  cv: number;
  /** Trailing days that actually carried data, and the ones that did not. */
  observedLevelDays: number;
  missingLevelDates: string[];
  /** Trailing days dropped for insufficient hourly coverage (partial days). */
  partialLevelDates: string[];

  /** Level-window days the sync-health signal reports as not collected. */
  syncGapDates: string[];
  /** Workloads dropped as retired, and workloads new inside the window. */
  retiredKeys: string[];
  newKeys: string[];
  /** Plain-language reasons, for the UI to show its own basis. */
  reasons: string[];
}

export const FORECAST_RULES = {
  /** Trailing window used as the level estimate. */
  levelDays: 7,
  /** Trailing days that must actually carry data before anything is projected. */
  minObservedLevelDays: 5,
  /** Window used to learn day-of-week factors. */
  seasonalityDays: 28,
  /** Apply weekly factors only when the pattern is this pronounced. */
  seasonalityMinSpread: 1.25,
  /** Trend damping — a 7-day slope does not run unchecked for three weeks. */
  trendDamping: 0.5,
  /** Hard cap on the damped slope, as a share of the daily level. */
  trendCapPerDay: 0.25,
  /** Above this dispersion, show a range instead of a point. */
  cvRangeThreshold: 0.15,
  /** Range half-width multiplier on the combined sigma. */
  rangeZ: 2.0,
  /** A range is never narrower than this share of the point estimate. */
  rangeFloorPct: 0.06,
  /** A workload below this share of trailing spend cannot trigger a break. */
  breakMinShare: 0.05,
  /** Consecutive observed silent days that mark a material workload retired. */
  breakSilentDays: 2,
  /** Hours of real collection a day needs before it counts as a full day. */
  minObservedHours: 20,
  /**
   * A sparse workload is not a truncated day. A day below the absolute floor
   * is only called partial when collection itself could have been cut short
   * (today, the first day, a day beside a collection gap) or when it collapses
   * below this share of the workspace's own typical covered hours.
   */
  partialRelativeFactor: 0.5,

  /** Width backstop: a high above this multiple of the point is not a forecast. */
  maxHighToPointRatio: 3,
  /** Width backstop: half-width above this share of the point is not a forecast. */
  maxHalfWidthPct: 0.6,
} as const;



const DAY_MS = 86_400_000;

function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function utcDayStart(iso: string): number {
  return Date.parse(`${iso.slice(0, 10)}T00:00:00.000Z`);
}

function dow(iso: string): number {
  return new Date(`${iso}T00:00:00.000Z`).getUTCDay();
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Forecast the current calendar month's total spend.
 *
 * `now` anchors the month and "today". Today is treated as incomplete: it is
 * excluded from the month-to-date actual and included in the projected days,
 * so a forecast read at 01:00 is not quietly short a day of spend.
 */
export function forecastMonthEnd(
  rows: ForecastInputRow[],
  now: Date,
  options: ForecastOptions = {},
): MonthEndForecast {
  const todayMs = utcDayStart(dayKey(now.getTime()));
  const year = new Date(todayMs).getUTCFullYear();
  const month = new Date(todayMs).getUTCMonth();
  const monthStartMs = Date.UTC(year, month, 1);
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const todayOfMonth = new Date(todayMs).getUTCDate();
  const remainingDays = daysInMonth - todayOfMonth + 1;
  const reasons: string[] = [];

  // ---- Daily totals, and per-workload dailies for structural breaks ---------
  // `observed` is the whole point of this pass: a day either carried data or
  // it did not. Absence is never silently read as a zero-spend day.
  const daily = new Map<string, number>();
  const observed = new Set<string>();
  const perKey = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const d = r.date.slice(0, 10);
    observed.add(d);
    daily.set(d, (daily.get(d) ?? 0) + r.spend);
    let k = perKey.get(r.key);
    if (!k) perKey.set(r.key, (k = new Map()));
    k.set(d, (k.get(d) ?? 0) + r.spend);
  }

  // ---- A. Partial-day contamination -----------------------------------------
  // A day with six hours of collection is not a cheap day, it is a fragment of
  // a day. Counted as a full day it drags the level down, invents a downward
  // trend and inflates sigma.
  //
  // But a low hour count has two very different causes, and only one of them
  // is a data fault:
  //
  //   * collection was truncated — the connection started mid-day, the day is
  //     still running, or the collector died and came back. That is the Aug 3
  //     failure mode and it must still be excluded.
  //   * the workspace simply does not call a model every hour. A batch job at
  //     06:00 and a support bot in office hours is a complete, honest day with
  //     ten covered hours. Hour buckets are derived from each event's real
  //     `occurred_at`, so a backfilled day looks exactly like a lived one —
  //     excluding these would suppress the forecast forever for every small
  //     or bursty customer, which is most new signups.
  //
  // So the absolute floor only bites where collection could actually have been
  // cut short, or where the day collapses against the workspace's own normal
  // covered-hour profile.
  const partialDays = new Set<string>();
  const coverage = options.hourCoverage;
  if (coverage) {
    const from = options.coverageReliableFrom ?? null;
    const firstDataDay = [...observed].sort()[0] ?? null;
    const todayKey = dayKey(todayMs);
    const gapDays = new Set(options.syncGapDates ?? []);
    const judged = [...observed].filter((d) => !from || d >= from);

    /** The workspace's own normal, learned from its judged days. */
    const hourCounts = judged.map((d) => coverage[d] ?? 0).sort((a, b) => a - b);
    const baselineHours = hourCounts.length
      ? hourCounts[Math.floor(hourCounts.length / 2)]
      : 24;

    const truncatable = (d: string): boolean => {
      if (d === todayKey) return true;
      if (d === firstDataDay) return true;
      const prev = dayKey(utcDayStart(d) - DAY_MS);
      const next = dayKey(utcDayStart(d) + DAY_MS);
      // Beside a hole in collection: either a day the collector never ran, or
      // a day that carries no usage at all inside the trailing window.
      for (const n of [prev, next]) {
        if (gapDays.has(n)) return true;
        // Today is always "missing" until it finishes; it is not a hole.
        if (!observed.has(n) && utcDayStart(n) >= todayMs - FORECAST_RULES.levelDays * DAY_MS && utcDayStart(n) < todayMs) {
          return true;
        }
      }
      return false;
    };

    for (const d of judged) {
      const hours = coverage[d] ?? 0;
      if (hours >= FORECAST_RULES.minObservedHours) continue;
      const collapsed = hours < baselineHours * FORECAST_RULES.partialRelativeFactor;
      if (!truncatable(d) && !collapsed) continue;
      partialDays.add(d);
      observed.delete(d);
    }
  }




  // ---- 1. Month-to-date actual: complete days only, never re-estimated ------
  let mtdUsd = 0;
  for (const [d, v] of daily) {
    const ms = utcDayStart(d);
    if (ms >= monthStartMs && ms < todayMs) mtdUsd += v;
  }
  /** Today is incomplete, but what has already landed is a hard floor. */
  const todaySoFarUsd = daily.get(dayKey(todayMs)) ?? 0;

  const levelDates: string[] = [];
  for (let i = FORECAST_RULES.levelDays; i >= 1; i--) levelDates.push(dayKey(todayMs - i * DAY_MS));
  const seasonDates: string[] = [];
  for (let i = FORECAST_RULES.seasonalityDays; i >= 1; i--) {
    seasonDates.push(dayKey(todayMs - i * DAY_MS));
  }

  const observedLevelDates = levelDates.filter((d) => observed.has(d));
  const missingLevelDates = levelDates.filter((d) => !observed.has(d) && !partialDays.has(d));
  const partialLevelDates = levelDates.filter((d) => partialDays.has(d));
  const gapSet = new Set(options.syncGapDates ?? []);
  const syncGapDates = levelDates.filter((d) => gapSet.has(d));

  /** Everything below is computed on observed days only. */
  const suppressedResult = (reason: string): MonthEndForecast => ({
    mtdUsd: round2(mtdUsd),
    pointUsd: null,
    lowUsd: null,
    highUsd: null,
    isRange: false,
    suppressed: true,
    suppressionReason: reason,
    remainingDays,
    dailyLevelUsd: 0,
    trendPerDayUsd: 0,
    seasonalityApplied: false,
    cv: 0,
    observedLevelDays: observedLevelDates.length,
    missingLevelDates,
    partialLevelDates,
    syncGapDates,
    retiredKeys: [],
    newKeys: [],
    reasons: [reason],
  });


  // ---- F. Sync-health interlock ---------------------------------------------
  // A day the collector never ran is not a quiet day. Where that day also
  // carries no usage, the hole is real and the projection refuses. Where data
  // landed anyway, the gap is a caveat on the basis, not a reason to refuse.
  const blindGapDates = syncGapDates.filter((d) => !observed.has(d));
  if (blindGapDates.length > 0) {
    return suppressedResult(
      `recent data gap (${blindGapDates.length} day${blindGapDates.length > 1 ? "s" : ""} not collected) — projection unavailable`,
    );
  }
  if (syncGapDates.length > 0) {
    reasons.push(
      `${syncGapDates.length} day${syncGapDates.length > 1 ? "s" : ""} in the trailing window had no successful sync run`,
    );
  }

  if (observedLevelDates.length < FORECAST_RULES.minObservedLevelDays) {
    return suppressedResult(
      `not enough data — only ${observedLevelDates.length} of the last ${FORECAST_RULES.levelDays} days carry a full day of usage`,
    );
  }
  if (missingLevelDates.length > 0) {
    reasons.push(
      `${missingLevelDates.length} day${missingLevelDates.length > 1 ? "s" : ""} without data excluded from the trailing rate`,
    );
  }
  if (partialLevelDates.length > 0) {
    reasons.push(
      `${partialLevelDates.length} partially collected day${partialLevelDates.length > 1 ? "s" : ""} (under ${FORECAST_RULES.minObservedHours}h of 24) excluded from the trailing rate`,
    );
  }


  // ---- 6. Structural breaks -------------------------------------------------
  const windowTotal = observedLevelDates.reduce((s, d) => s + (daily.get(d) ?? 0), 0);
  const retiredKeys: string[] = [];
  const newKeys: string[] = [];
  /**
   * Retirement needs positive evidence: days that carried data and still show
   * nothing for this workload. A missing day proves nothing about a workload.
   */
  const silentDates = observedLevelDates.slice(-FORECAST_RULES.breakSilentDays);
  const priorDates = seasonDates.filter((d) => !levelDates.includes(d) && observed.has(d));

  for (const [key, series] of perKey) {
    const keyWindow = observedLevelDates.reduce((s, d) => s + (series.get(d) ?? 0), 0);
    const share = windowTotal > 0 ? keyWindow / windowTotal : 0;
    const silent =
      silentDates.length >= FORECAST_RULES.breakSilentDays &&
      silentDates.every((d) => (series.get(d) ?? 0) === 0);
    if (share >= FORECAST_RULES.breakMinShare && silent && keyWindow > 0) {
      retiredKeys.push(key);
    }
    const seenBefore = priorDates.some((d) => (series.get(d) ?? 0) > 0);
    if (!seenBefore && keyWindow > 0 && share >= FORECAST_RULES.breakMinShare) {
      newKeys.push(key);
    }
  }

  const retired = new Set(retiredKeys);
  /** Trailing dailies with retired workloads removed — they will not recur. */
  const levelSeries = observedLevelDates.map((d) => {
    let v = daily.get(d) ?? 0;
    for (const key of retired) v -= perKey.get(key)?.get(d) ?? 0;

    return Math.max(0, v);
  });

  if (retiredKeys.length) {
    reasons.push(
      `${retiredKeys.length} workload${retiredKeys.length > 1 ? "s" : ""} stopped ${FORECAST_RULES.breakSilentDays}+ days ago and ${retiredKeys.length > 1 ? "are" : "is"} excluded from the remaining days`,
    );
  }
  if (newKeys.length) {
    reasons.push(
      `${newKeys.length} workload${newKeys.length > 1 ? "s" : ""} started inside the last ${FORECAST_RULES.levelDays} days — too new to project precisely`,
    );
  }

  // ---- 3. Weekly seasonality, only when the pattern is real ------------------
  const seasonValues = seasonDates
    .map((d) => ({ d, v: daily.get(d) ?? 0 }))
    .filter((x) => x.v > 0);
  const factors = new Map<number, number>();
  let seasonalityApplied = false;
  if (seasonValues.length >= 14) {
    const overall = mean(seasonValues.map((x) => x.v));
    const byDow = new Map<number, number[]>();
    for (const x of seasonValues) {
      const k = dow(x.d);
      byDow.set(k, [...(byDow.get(k) ?? []), x.v]);
    }
    if (byDow.size === 7 && overall > 0) {
      for (const [k, vs] of byDow) factors.set(k, mean(vs) / overall);
      const fs = [...factors.values()];
      const spread = Math.max(...fs) / Math.min(...fs);
      if (spread >= FORECAST_RULES.seasonalityMinSpread) {
        seasonalityApplied = true;
        reasons.push(`weekly pattern detected (${spread.toFixed(2)}x weekday/weekend spread) and applied`);
      }
    }
  }
  const factorFor = (iso: string) => (seasonalityApplied ? (factors.get(dow(iso)) ?? 1) : 1);

  // ---- 2 + 4. Deseasonalised level and damped, capped trend ------------------
  const deseasonalised = observedLevelDates.map((d, i) => levelSeries[i]! / (factorFor(d) || 1));
  const level = mean(deseasonalised);

  let slope = 0;
  if (deseasonalised.length >= 3 && level > 0) {
    const n = deseasonalised.length;
    const xbar = (n - 1) / 2;
    const ybar = level;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      num += (i - xbar) * (deseasonalised[i]! - ybar);
      den += (i - xbar) ** 2;
    }
    slope = den > 0 ? num / den : 0;
  }
  const cap = level * FORECAST_RULES.trendCapPerDay;
  const trendPerDay = Math.max(-cap, Math.min(cap, slope * FORECAST_RULES.trendDamping));

  // ---- Project the remaining days -------------------------------------------
  const lastIndex = deseasonalised.length - 1;
  let projected = 0;
  for (let k = 1; k <= remainingDays; k++) {
    const iso = dayKey(todayMs + (k - 1) * DAY_MS);
    const base = level + trendPerDay * (lastIndex + k - (deseasonalised.length - 1) / 2);
    projected += Math.max(0, base) * factorFor(iso);
  }
  const pointUsd = mtdUsd + projected;

  // ---- 5. Honest uncertainty -------------------------------------------------
  const noise = stdev(deseasonalised);
  const cv = level > 0 ? noise / level : 0;
  const forcedRange = newKeys.length > 0 || retiredKeys.length > 0;
  const isRange = cv > FORECAST_RULES.cvRangeThreshold || forcedRange;

  let lowUsd: number | null = null;
  let highUsd: number | null = null;
  if (isRange) {
    // Two independent error sources: day-to-day noise over the remaining days,
    // and the uncertainty in the level itself, which does not average out.
    // Independent errors add in quadrature, not linearly — adding them
    // linearly assumed perfect correlation and inflated the band by ~40%.
    const dayNoise = noise * Math.sqrt(remainingDays);
    const levelNoise = (noise / Math.sqrt(Math.max(1, deseasonalised.length))) * remainingDays;
    const sigma = Math.sqrt(dayNoise ** 2 + levelNoise ** 2);
    const half = Math.max(FORECAST_RULES.rangeZ * sigma, pointUsd * FORECAST_RULES.rangeFloorPct);
    lowUsd = Math.max(mtdUsd + todaySoFarUsd, pointUsd - half);
    highUsd = pointUsd + half;
    if (cv > FORECAST_RULES.cvRangeThreshold) {
      reasons.push(`daily spend varies too much (cv ${cv.toFixed(2)}) for a single number`);
    }
  }

  // ---- D. Coherence gate -----------------------------------------------------
  // A self-inconsistent figure is worse than no figure. The month cannot close
  // below what has already been spent, and the bounds must bracket the point.
  const floor = mtdUsd + todaySoFarUsd;
  const incoherent =
    !Number.isFinite(pointUsd) ||
    pointUsd < floor - 0.01 ||
    (isRange &&
      (lowUsd === null ||
        highUsd === null ||
        lowUsd > pointUsd + 0.01 ||
        highUsd < pointUsd - 0.01 ||
        lowUsd < floor - 0.01));
  if (incoherent) {
    return suppressedResult(
      "not enough data for a coherent projection — the trailing window disagrees with what is already spent",
    );
  }

  // ---- C. Width backstop ------------------------------------------------------
  // Defence in depth for the data-quality failure mode nobody anticipated. A
  // band whose top is several times its own centre is not a forecast, however
  // it was arrived at, and no coherence check on direction alone will catch it.
  if (isRange && highUsd !== null && lowUsd !== null && pointUsd > 0) {
    const half = Math.max(highUsd - pointUsd, pointUsd - lowUsd);
    const tooWide =
      highUsd > pointUsd * FORECAST_RULES.maxHighToPointRatio ||
      half > pointUsd * FORECAST_RULES.maxHalfWidthPct;
    if (tooWide) {
      return suppressedResult("recent collection gap — projection unavailable");
    }
  }

  return {
    mtdUsd: round2(mtdUsd),
    pointUsd: round2(pointUsd),
    lowUsd: lowUsd === null ? null : round2(lowUsd),
    highUsd: highUsd === null ? null : round2(highUsd),
    isRange,
    suppressed: false,
    suppressionReason: null,
    remainingDays,
    dailyLevelUsd: round2(level),
    trendPerDayUsd: round2(trendPerDay),
    seasonalityApplied,
    cv: Math.round(cv * 1000) / 1000,
    observedLevelDays: observedLevelDates.length,
    partialLevelDates,

    missingLevelDates,
    syncGapDates,
    retiredKeys,
    newKeys,
    reasons,
  };
}

