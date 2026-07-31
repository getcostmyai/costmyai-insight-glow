import { describe, expect, it } from "vitest";

import {
  partitionRollups,
  rangeWindow,
  selectCapturesInWindow,
  selectSwitchesInWindow,
} from "../window";

/**
 * The regression this file exists for: dollar figures scaled with the period
 * toggle while the underlying lists silently did not. Every list the dashboard
 * renders gets its own proof here — a real row that is present at 30 days and
 * genuinely absent at 7 days.
 */

const NOW = Date.parse("2026-07-31T12:00:00.000Z");
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();
const agoDate = (days: number) => ago(days).slice(0, 10);

describe("rangeWindow", () => {
  it("puts the window start exactly N days back and the comparison window before it", () => {
    const w = rangeWindow(7, NOW);
    expect(w.start).toBe(ago(7));
    expect(w.previousStart).toBe(ago(14));
  });
});

describe("usage rollups — the series and every engine-derived list", () => {
  const rollups = [
    { bucket_start: ago(11), cost_usd: 110, model_key: "gpt-5.5" }, // the 11-day-old row
    { bucket_start: ago(3), cost_usd: 30, model_key: "gpt-5.5" },
    { bucket_start: ago(25), cost_usd: 250, model_key: "o1-pro" },
  ];

  it("includes the 11-day-old workload at 30 days", () => {
    const { current } = partitionRollups(rollups, rangeWindow(30, NOW));
    expect(current.map((r) => r.bucket_start)).toContain(ago(11));
    expect(current).toHaveLength(3);
  });

  it("excludes the same 11-day-old workload at 7 days", () => {
    const { current, previous } = partitionRollups(rollups, rangeWindow(7, NOW));
    expect(current.map((r) => r.bucket_start)).not.toContain(ago(11));
    expect(current).toHaveLength(1);
    // It lands in the comparison window instead, so the delta stays honest.
    expect(previous.map((r) => r.bucket_start)).toContain(ago(11));
  });

  it("excludes it at 24 hours too", () => {
    const { current } = partitionRollups(rollups, rangeWindow(1, NOW));
    expect(current).toHaveLength(0);
  });
});

describe("active switches", () => {
  const switches = [
    { activated_at: ago(11), to_model: "gpt-5.5-mini" }, // the 11-day-old switch
    { activated_at: ago(2), to_model: "qwen3-coder-next" },
  ];

  it("shows the 11-day-old switch at 30 days", () => {
    const rows = selectSwitchesInWindow(switches, rangeWindow(30, NOW));
    expect(rows.map((s) => s.to_model)).toEqual(["gpt-5.5-mini", "qwen3-coder-next"]);
  });

  it("drops the 11-day-old switch at 7 days", () => {
    const rows = selectSwitchesInWindow(switches, rangeWindow(7, NOW));
    expect(rows.map((s) => s.to_model)).toEqual(["qwen3-coder-next"]);
  });

  it("drops both at 24 hours", () => {
    expect(selectSwitchesInWindow(switches, rangeWindow(1, NOW))).toHaveLength(0);
  });
});

describe("billing reconciliation", () => {
  const captures = [
    { period_start: agoDate(41), period_end: agoDate(11), provider: "openai" }, // 11-day-old close
    { period_start: agoDate(30), period_end: agoDate(1), provider: "azure" },
  ];

  it("shows the period that closed 11 days ago at 30 days", () => {
    const rows = selectCapturesInWindow(captures, rangeWindow(30, NOW));
    expect(rows.map((c) => c.provider)).toEqual(["openai", "azure"]);
  });

  it("drops it at 7 days", () => {
    const rows = selectCapturesInWindow(captures, rangeWindow(7, NOW));
    expect(rows.map((c) => c.provider)).toEqual(["azure"]);
  });
});
