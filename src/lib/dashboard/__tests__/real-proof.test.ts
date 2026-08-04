import { describe, it } from "vitest";
import { forecastMonthEnd } from "../forecast";

// Real Demo Workspace daily spend (usage_rollups, granularity=day), read live.
const real: Record<string, number> = {
"2026-07-16":668.99,"2026-07-17":685.04,"2026-07-18":326.57,"2026-07-19":278.55,
"2026-07-20":687.68,"2026-07-21":702.35,"2026-07-22":738.07,"2026-07-23":764.49,
"2026-07-24":765.45,"2026-07-25":372.24,"2026-07-26":338.92,"2026-07-27":818.00,
"2026-07-28":801.36,"2026-07-29":798.35,"2026-07-30":1041.79,"2026-07-31":1528.39,
"2026-08-03":251.86,"2026-08-04":372.57};
const rows = Object.entries(real).map(([date, spend]) => ({ date, key: "demo|all|all", spend }));
const NOW = new Date("2026-08-04T08:15:00.000Z");

describe("real demo data", () => {
  it("with the real sync gap", () => {
    console.log(JSON.stringify(forecastMonthEnd(rows, NOW, { syncGapDates: ["2026-08-02"] }), null, 1));
  });
  it("without the interlock (B+D only)", () => {
    console.log(JSON.stringify(forecastMonthEnd(rows, NOW), null, 1));
  });
});
