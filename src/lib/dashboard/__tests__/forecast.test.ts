import { describe, expect, it } from "vitest";
import { forecastMonthEnd, FORECAST_RULES, type ForecastInputRow } from "../forecast";

const DAY_MS = 86_400_000;
/** Mid-month anchor: 15 complete days behind, 16 days still to project. */
const NOW = new Date("2026-07-16T09:00:00.000Z");

function iso(offsetDays: number, from: Date = NOW): string {
  return new Date(Date.parse(`${from.toISOString().slice(0, 10)}T00:00:00.000Z`) + offsetDays * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** Build `days` of complete history ending yesterday, from a per-day amount fn. */
function history(days: number, amount: (dayIso: string, i: number) => number, key = "gpt-5-mini|azure|chat"): ForecastInputRow[] {
  const rows: ForecastInputRow[] = [];
  for (let i = days; i >= 1; i--) {
    const d = iso(-i);
    rows.push({ date: d, key, spend: amount(d, days - i) });
  }
  return rows;
}

describe("forecastMonthEnd — shape 1: constant workload", () => {
  const rows = history(40, () => 100);
  const f = forecastMonthEnd(rows, NOW);

  it("uses month-to-date actual as a fixed known baseline", () => {
    // Jul 1..15 complete = 15 days x $100.
    expect(f.mtdUsd).toBe(1500);
    expect(f.remainingDays).toBe(16);
  });

  it("projects the remaining days at the trailing level", () => {
    expect(f.dailyLevelUsd).toBeCloseTo(100, 6);
    expect(f.pointUsd).toBeCloseTo(3100, 2);
  });

  it("shows a point estimate, not a range, when spend is stable", () => {
    expect(f.cv).toBe(0);
    expect(f.isRange).toBe(false);
    expect(f.lowUsd).toBeNull();
    expect(f.highUsd).toBeNull();
  });

  it("does not invent a trend out of flat data", () => {
    expect(f.trendPerDayUsd).toBe(0);
    expect(f.seasonalityApplied).toBe(false);
  });
});

describe("forecastMonthEnd — shape 2: weekly seasonality", () => {
  // Weekdays $120, weekends $40 — a 2x+ spread the forecaster must respect.
  const weekly = (d: string) => {
    const day = new Date(`${d}T00:00:00.000Z`).getUTCDay();
    return day === 0 || day === 6 ? 40 : 120;
  };
  const f = forecastMonthEnd(history(40, weekly), NOW);

  it("detects and applies the weekly pattern", () => {
    expect(f.seasonalityApplied).toBe(true);
    expect(f.reasons.join(" ")).toMatch(/weekly pattern/);
  });

  it("projects each remaining day at its own day-of-week rate", () => {
    // Jul 16-31 2026: 12 weekdays, 4 weekend days.
    const expectedRemaining = 12 * 120 + 4 * 40;
    expect(f.pointUsd! - f.mtdUsd).toBeCloseTo(expectedRemaining, 0);
  });

  it("beats a flat trailing-rate extrapolation on the same data", () => {
    const flat = f.mtdUsd + f.remainingDays * (7 * 120 - 2 * 80) / 7; // naive 7-day mean
    const truth = f.mtdUsd + 12 * 120 + 4 * 40;
    expect(Math.abs(f.pointUsd! - truth)).toBeLessThan(Math.abs(flat - truth));
  });

  it("does not report a range purely because of a known weekly pattern", () => {
    // Seasonality is removed before dispersion is measured, so a clean weekly
    // shape is a confident forecast, not an uncertain one.
    expect(f.isRange).toBe(false);
  });
});

describe("forecastMonthEnd — shape 3: spiky workload", () => {
  // Same mean as the constant case, wildly different day-to-day.
  const spike = (_d: string, i: number) => (i % 3 === 0 ? 260 : 30);
  const f = forecastMonthEnd(history(40, spike), NOW);

  it("shows a range rather than a confident point", () => {
    expect(f.cv).toBeGreaterThan(FORECAST_RULES.cvRangeThreshold);
    expect(f.isRange).toBe(true);
    expect(f.lowUsd).not.toBeNull();
    expect(f.highUsd).not.toBeNull();
  });

  it("brackets the point estimate and never dips below money already spent", () => {
    expect(f.lowUsd!).toBeLessThanOrEqual(f.pointUsd!);
    expect(f.highUsd!).toBeGreaterThanOrEqual(f.pointUsd!);
    expect(f.lowUsd!).toBeGreaterThanOrEqual(f.mtdUsd);
  });

  it("caps the damped trend so a spike cannot compound across the month", () => {
    expect(Math.abs(f.trendPerDayUsd)).toBeLessThanOrEqual(
      f.dailyLevelUsd * FORECAST_RULES.trendCapPerDay + 0.01,
    );
  });
});

describe("forecastMonthEnd — trend handling", () => {
  it("follows a real growth trend, damped rather than extrapolated raw", () => {
    const f = forecastMonthEnd(history(40, (_d, i) => 60 + i * 4), NOW);
    expect(f.trendPerDayUsd).toBeGreaterThan(0);
    const raw = f.mtdUsd + f.remainingDays * (f.dailyLevelUsd + 4 * f.remainingDays);
    expect(f.pointUsd!).toBeLessThan(raw);
    expect(f.pointUsd!).toBeGreaterThan(f.mtdUsd + f.remainingDays * f.dailyLevelUsd);
  });

  it("follows a decline without projecting negative spend", () => {
    const f = forecastMonthEnd(history(40, (_d, i) => Math.max(0, 200 - i * 5)), NOW);
    expect(f.trendPerDayUsd).toBeLessThan(0);
    expect(f.pointUsd!).toBeGreaterThanOrEqual(f.mtdUsd);
  });
});

describe("forecastMonthEnd — shape 4a: structural break, retired workload", () => {
  /**
   * The confidently-wrong case. A $200/day workload ran all month and stopped
   * three days ago. A flat rate keeps billing it for the rest of the month.
   */
  const rows: ForecastInputRow[] = [];
  for (let i = 40; i >= 1; i--) {
    const d = iso(-i);
    rows.push({ date: d, key: "steady|azure|chat", spend: 100 });
    rows.push({ date: d, key: "retired|openai|batch", spend: i >= 3 ? 200 : 0 });
  }
  const f = forecastMonthEnd(rows, NOW);
  const flatRate = f.mtdUsd + f.remainingDays * 300;

  it("identifies the silent workload as retired", () => {
    expect(f.retiredKeys).toEqual(["retired|openai|batch"]);
    expect(f.reasons.join(" ")).toMatch(/stopped/);
  });

  it("excludes it from the remaining days instead of billing it forward", () => {
    // Level should collapse to the surviving $100/day workload.
    expect(f.dailyLevelUsd).toBeCloseTo(100, 0);
    expect(f.pointUsd!).toBeLessThan(flatRate - 2000);
  });

  it("shows an honest range instead of the confidently-wrong number", () => {
    expect(f.isRange).toBe(true);
    expect(f.lowUsd).not.toBeNull();
    expect(f.highUsd).not.toBeNull();
    // The old flat-rate answer is emphatically outside the honest range.
    expect(flatRate).toBeGreaterThan(f.highUsd!);
  });

  it("still counts the retired workload's real month-to-date spend", () => {
    // It genuinely ran for 12 of the 15 complete days this month.
    expect(f.mtdUsd).toBeGreaterThan(15 * 100);
  });

  it("leaves an immaterial silent workload alone", () => {
    const small: ForecastInputRow[] = [];
    for (let i = 40; i >= 1; i--) {
      const d = iso(-i);
      small.push({ date: d, key: "steady|azure|chat", spend: 100 });
      small.push({ date: d, key: "tiny|openai|batch", spend: i >= 3 ? 1 : 0 });
    }
    expect(forecastMonthEnd(small, NOW).retiredKeys).toEqual([]);
  });
});

describe("forecastMonthEnd — shape 4b: newly appeared workload", () => {
  const rows: ForecastInputRow[] = [];
  for (let i = 40; i >= 1; i--) {
    const d = iso(-i);
    rows.push({ date: d, key: "steady|azure|chat", spend: 100 });
    if (i <= 4) rows.push({ date: d, key: "brand-new|bedrock|agent", spend: 90 });
  }
  const f = forecastMonthEnd(rows, NOW);

  it("flags the new workload as too new to project precisely", () => {
    expect(f.newKeys).toEqual(["brand-new|bedrock|agent"]);
    expect(f.reasons.join(" ")).toMatch(/too new/);
  });

  it("forces a range even though the blended series looks calm", () => {
    expect(f.isRange).toBe(true);
    expect(f.highUsd! - f.lowUsd!).toBeGreaterThan(0);
  });

  it("still includes the new workload in the projected level", () => {
    expect(f.dailyLevelUsd).toBeGreaterThan(100);
  });
});

describe("forecastMonthEnd — guards", () => {
  it("suppresses rather than projecting zero for an empty workspace", () => {
    const f = forecastMonthEnd([], NOW);
    expect(f.mtdUsd).toBe(0);
    expect(f.suppressed).toBe(true);
    expect(f.pointUsd).toBeNull();
    expect(f.observedLevelDays).toBe(0);
    expect(f.suppressionReason).toMatch(/not enough data/);
  });

  it("never projects days that have already happened", () => {
    const last = new Date("2026-07-31T23:00:00.000Z");
    const f = forecastMonthEnd(history(40, () => 100, "k"), last);
    expect(f.remainingDays).toBe(1);
  });

  it("keeps the range floor at 6% of the point estimate", () => {
    const rows: ForecastInputRow[] = [];
    for (let i = 40; i >= 1; i--) {
      const d = iso(-i);
      rows.push({ date: d, key: "steady|azure|chat", spend: 100 });
      if (i <= 3) rows.push({ date: d, key: "new|azure|agent", spend: 20 });
    }
    const f = forecastMonthEnd(rows, NOW);
    expect(f.highUsd! - f.lowUsd!).toBeGreaterThanOrEqual(
      f.pointUsd! * FORECAST_RULES.rangeFloorPct * 0.99,
    );
  });
});

/* ---------------- B: a missing day is not a zero-spend day ---------------- */

describe("forecastMonthEnd — missing days are excluded, not zeroed", () => {
  /** 40 days at $100/day, with two days simply absent from the feed. */
  const gapped = (): ForecastInputRow[] =>
    history(40, () => 100).filter((r) => r.date !== iso(-5) && r.date !== iso(-6));

  const f = forecastMonthEnd(gapped(), NOW);

  it("reports which trailing days carried data", () => {
    expect(f.observedLevelDays).toBe(5);
    expect(f.missingLevelDates).toEqual([iso(-6), iso(-5)]);
  });

  it("keeps the level at the observed rate instead of collapsing it", () => {
    // Zeroing the two absent days would give 500/7 = $71.43/day.
    expect(f.dailyLevelUsd).toBeCloseTo(100, 6);
    expect(f.dailyLevelUsd).not.toBeCloseTo(500 / 7, 1);
  });

  it("keeps sigma at the observed dispersion instead of inventing variance", () => {
    // Zeroed days would put cv near 0.5; the observed series is flat.
    expect(f.cv).toBe(0);
    expect(f.isRange).toBe(false);
  });

  it("says so in the basis instead of hiding the hole", () => {
    expect(f.reasons.join(" ")).toMatch(/2 days without data/);
  });

  it("does not call a workload retired on the strength of missing days", () => {
    // The whole feed stops for two days: absence, not evidence.
    const rows = history(40, () => 100, "steady|azure|chat")
      .concat(history(40, () => 200, "maybe|openai|batch"))
      .filter((r) => r.date !== iso(-1) && r.date !== iso(-2));
    const g = forecastMonthEnd(rows, NOW);
    expect(g.retiredKeys).toEqual([]);
  });

  it("still calls a workload retired on positive evidence", () => {
    // Days that carry data for other workloads and show zero for this one.
    const rows: ForecastInputRow[] = [];
    for (let i = 40; i >= 1; i--) {
      const d = iso(-i);
      rows.push({ date: d, key: "steady|azure|chat", spend: 100 });
      rows.push({ date: d, key: "retired|openai|batch", spend: i >= 3 ? 200 : 0 });
    }
    expect(forecastMonthEnd(rows, NOW).retiredKeys).toEqual(["retired|openai|batch"]);
  });

  it("suppresses once too few trailing days carry data", () => {
    const sparse = history(40, () => 100).filter(
      (r) => ![iso(-2), iso(-3), iso(-4)].includes(r.date),
    );
    const g = forecastMonthEnd(sparse, NOW);
    expect(g.observedLevelDays).toBe(4);
    expect(g.suppressed).toBe(true);
    expect(g.pointUsd).toBeNull();
    expect(g.suppressionReason).toMatch(/only 4 of the last 7 days/);
  });
});

/* ------------- sigma combines in quadrature, not linearly ---------------- */

describe("forecastMonthEnd — range width", () => {
  const spike = (_d: string, i: number) => (i % 3 === 0 ? 260 : 30);
  const f = forecastMonthEnd(history(40, spike), NOW);

  it("adds day noise and level noise in quadrature", () => {
    const noiseDays = 7;
    const days = f.remainingDays;
    // Reconstruct sigma from the reported half-width and compare both laws.
    const half = (f.highUsd! - f.lowUsd!) / 2;
    const sigmaUsed = half / FORECAST_RULES.rangeZ;
    const unit = sigmaUsed / Math.sqrt(days + days ** 2 / noiseDays);
    const linear = unit * (Math.sqrt(days) + days / Math.sqrt(noiseDays));
    expect(sigmaUsed).toBeLessThan(linear * 0.85);
  });
});

/* --------------------- D: coherence gate on the output -------------------- */

describe("forecastMonthEnd — coherence gate", () => {
  it("suppresses when the projection lands below money already spent", () => {
    /**
     * Real incoherence: a huge month-to-date, then a trailing week that is a
     * rounding error next to it. The projected close is below the floor of
     * month-to-date plus what today has already booked.
     */
    const rows: ForecastInputRow[] = [];
    for (let i = 15; i >= 8; i--) rows.push({ date: iso(-i), key: "k", spend: 20_000 });
    for (let i = 7; i >= 1; i--) rows.push({ date: iso(-i), key: "k", spend: 1 });
    // Today has already booked more than the whole projected remainder.
    rows.push({ date: iso(0), key: "k", spend: 40_000 });
    const f = forecastMonthEnd(rows, NOW);
    expect(f.suppressed).toBe(true);
    expect(f.pointUsd).toBeNull();
    expect(f.lowUsd).toBeNull();
    expect(f.suppressionReason).toMatch(/coherent/);
  });

  it("lets a coherent projection through unchanged", () => {
    const f = forecastMonthEnd(history(40, () => 100), NOW);
    expect(f.suppressed).toBe(false);
    expect(f.pointUsd!).toBeGreaterThanOrEqual(f.mtdUsd);
  });

  it("floors the low bound at month-to-date plus today's booked spend", () => {
    const rows = history(40, (_d, i) => (i % 3 === 0 ? 260 : 30));
    rows.push({ date: iso(0), key: "gpt-5-mini|azure|chat", spend: 120 });
    const f = forecastMonthEnd(rows, NOW);
    expect(f.lowUsd!).toBeGreaterThanOrEqual(f.mtdUsd + 120 - 0.01);
    expect(f.lowUsd!).toBeLessThanOrEqual(f.pointUsd!);
    expect(f.highUsd!).toBeGreaterThanOrEqual(f.pointUsd!);
  });
});

/* --------------------- F: sync-health interlock --------------------------- */

describe("forecastMonthEnd — sync-health interlock", () => {
  it("refuses to project through a day the collectors never ran", () => {
    const f = forecastMonthEnd(history(40, () => 100), NOW, {
      syncGapDates: [iso(-3)],
    });
    expect(f.suppressed).toBe(true);
    expect(f.pointUsd).toBeNull();
    expect(f.syncGapDates).toEqual([iso(-3)]);
    expect(f.suppressionReason).toMatch(/recent data gap/);
  });

  it("ignores sync gaps that fall outside the level window", () => {
    const f = forecastMonthEnd(history(40, () => 100), NOW, {
      syncGapDates: [iso(-20)],
    });
    expect(f.suppressed).toBe(false);
    expect(f.syncGapDates).toEqual([]);
  });
});
