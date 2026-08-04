import { describe, expect, it } from "vitest";

import { classifySyncHealth, type RunLedgerRow } from "../sync-health";

const NOW = Date.parse("2026-08-09T12:00:00.000Z");
const LEVEL = 7; // window is 2026-08-02 … 2026-08-08

function run(day: string, outcome: string | null, job = "usage-tick"): RunLedgerRow {
  return { job, started_at: `${day}T04:00:00.000Z`, outcome, ok: outcome !== "failed" };
}

/** Every day of the window has a normal, row-producing run except where stated. */
function baseline(): RunLedgerRow[] {
  return [
    run("2026-08-02", "ok"),
    run("2026-08-03", "ok"),
    run("2026-08-04", "ok"),
    run("2026-08-05", "ok"),
    run("2026-08-06", "ok"),
    run("2026-08-07", "ok"),
    run("2026-08-08", "ok"),
  ];
}

describe("sync health — ok, ok-but-empty and no-run are three distinct states", () => {
  it("treats a full window of row-producing runs as observed", () => {
    const h = classifySyncHealth(baseline(), NOW, LEVEL);
    expect(h.gapDays).toEqual([]);
    expect(h.emptyDays).toEqual([]);
    expect(h.byDay["2026-08-05"]).toBe("observed");
  });

  it("flags the Aug 1 shape: the run reported success and wrote zero rows", () => {
    const rows = baseline().filter((r) => !r.started_at.startsWith("2026-08-05"));
    rows.push(run("2026-08-05", "empty"));
    const h = classifySyncHealth(rows, NOW, LEVEL);
    expect(h.byDay["2026-08-05"]).toBe("empty");
    expect(h.emptyDays).toEqual(["2026-08-05"]);
    // Same consequence as a missing day: not observed.
    expect(h.gapDays).toEqual(["2026-08-05"]);
  });

  it("flags a day with no run at all, and distinguishes it from ok-but-empty", () => {
    const rows = baseline().filter((r) => !r.started_at.startsWith("2026-08-05"));
    const h = classifySyncHealth(rows, NOW, LEVEL);
    expect(h.byDay["2026-08-05"]).toBe("absent");
    expect(h.emptyDays).toEqual([]);
    expect(h.gapDays).toEqual(["2026-08-05"]);
  });

  it("accepts a genuinely quiet day as observed", () => {
    const rows = baseline().filter((r) => !r.started_at.startsWith("2026-08-05"));
    rows.push(run("2026-08-05", "quiet"));
    const h = classifySyncHealth(rows, NOW, LEVEL);
    expect(h.byDay["2026-08-05"]).toBe("observed");
    expect(h.gapDays).toEqual([]);
  });

  it("counts a failed run as a gap", () => {
    const rows = baseline().filter((r) => !r.started_at.startsWith("2026-08-05"));
    rows.push(run("2026-08-05", "failed"));
    expect(classifySyncHealth(rows, NOW, LEVEL).gapDays).toEqual(["2026-08-05"]);
  });

  it("ignores non-usage collectors — 413 healthy pricing runs prove nothing about usage", () => {
    const rows = [
      run("2026-08-05", "ok", "pricing-sync"),
      run("2026-08-05", "ok", "benchmark-sync"),
      ...baseline().filter((r) => !r.started_at.startsWith("2026-08-05")),
    ];
    const h = classifySyncHealth(rows, NOW, LEVEL);
    expect(h.byDay["2026-08-05"]).toBe("absent");
    expect(h.gapDays).toEqual(["2026-08-05"]);
  });

  it("says nothing about days before the ledger began recording outcomes", () => {
    const rows = [run("2026-08-06", "ok"), run("2026-08-07", "ok"), run("2026-08-08", "ok")];
    const h = classifySyncHealth(rows, NOW, LEVEL);
    expect(h.byDay["2026-08-03"]).toBe("unknown");
    expect(h.gapDays).toEqual([]);
  });

  it("has nothing to say when the ledger is empty", () => {
    expect(classifySyncHealth([], NOW, LEVEL).gapDays).toEqual([]);
  });
});
