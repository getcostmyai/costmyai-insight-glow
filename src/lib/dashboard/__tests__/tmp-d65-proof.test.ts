import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { classifySyncHealth, type RunLedgerRow } from "../sync-health";
import { forecastMonthEnd, FORECAST_RULES } from "../forecast";

const rows = JSON.parse(readFileSync("/tmp/rollups.json", "utf8")) as {
  date: string; key: string; spend: number;
}[];
const now = new Date("2026-08-04T09:00:00.000Z");
const LEVEL = FORECAST_RULES.levelDays;
const DAY = 86_400_000;

function ledger(overrides: Record<string, string>): RunLedgerRow[] {
  const out: RunLedgerRow[] = [];
  for (let i = LEVEL; i >= 1; i--) {
    const d = new Date(Date.parse("2026-08-04T00:00:00.000Z") - i * DAY).toISOString().slice(0, 10);
    const outcome = overrides[d] ?? "ok";
    if (outcome === "none") continue;
    out.push({ job: "usage-tick", started_at: `${d}T04:00:00.000Z`, outcome, ok: outcome !== "failed" });
  }
  return out;
}

describe("D65 proof against real demo spend", () => {
  it("healthy ledger => projection computes", () => {
    const h = classifySyncHealth(ledger({}), now.getTime(), LEVEL);
    const f = forecastMonthEnd(rows, now, { syncGapDates: h.gapDays });
    console.log("HEALTHY", { gaps: h.gapDays, suppressed: f.suppressed, point: f.pointUsd });
    expect(h.gapDays).toEqual([]);
  });

  it("Aug-1-shaped incident (run ok, zero rows) suppresses", () => {
    const day = new Date(now.getTime() - 2 * DAY).toISOString().slice(0, 10);
    const h = classifySyncHealth(ledger({ [day]: "empty" }), now.getTime(), LEVEL);
    const f = forecastMonthEnd(rows.filter((r) => r.date !== day), now, { syncGapDates: h.gapDays });
    console.log("EMPTY", { day, empty: h.emptyDays, suppressed: f.suppressed, reason: f.suppressionReason });
    expect(h.emptyDays).toEqual([day]);
    expect(f.suppressed).toBe(true);
  });

  it("no run at all suppresses the same way", () => {
    const day = new Date(now.getTime() - 2 * DAY).toISOString().slice(0, 10);
    const h = classifySyncHealth(ledger({ [day]: "none" }), now.getTime(), LEVEL);
    const f = forecastMonthEnd(rows.filter((r) => r.date !== day), now, { syncGapDates: h.gapDays });
    console.log("ABSENT", { day, byDay: h.byDay[day], suppressed: f.suppressed, reason: f.suppressionReason });
    expect(f.suppressed).toBe(true);
  });
});
