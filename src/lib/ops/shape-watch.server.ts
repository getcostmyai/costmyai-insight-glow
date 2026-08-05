/**
 * The unrecognised-shape watch (Dispatch 104).
 *
 * The connector parses five response envelopes. That is a claim about the
 * market, and the market changes: a provider ships a sixth shape, or a new
 * provider appears on the pricing feed that nobody has ever inspected. Both
 * are silent failures — the customer's traffic is still forwarded, still
 * accepted, and quietly metered as zero or as an estimate.
 *
 * So both raise a signal on the ledger the team already watches. No new
 * system, no second inbox: `sync_runs` under one job name, judged as an
 * event-driven watch by `judgeJob` and rendered on /admin/jobs beside every
 * scheduled collector.
 */

import { SHAPE_WATCH_JOB } from "./jobs";

export type ShapeWatchSource = "ingest" | "pricing-feed";

export interface ShapeWatchReport {
  source: ShapeWatchSource;
  /** One line, printed as-is on the board. */
  summary: string;
  /** How many distinct things this report covers (events, providers). */
  count: number;
  detail?: unknown;
}

/**
 * Record one report. Deliberately best-effort: a watch that could not write
 * its warning must never take down the ingest path it is watching, and the
 * failure is logged where the server logs are read.
 */
export async function reportUnrecognisedShape(report: ShapeWatchReport): Promise<boolean> {
  try {
    const { recordRun } = await import("@/lib/engine/evaluate.server");
    await recordRun({
      job: SHAPE_WATCH_JOB,
      started: new Date(),
      // `failed` is the alerting state on the board. Nothing here failed to
      // run; something ran and found a shape we cannot account for, which is
      // exactly what the team needs to see coloured red.
      outcome: "failed",
      rowsWritten: report.count,
      error: `[${report.source}] ${report.summary}`,
      detail: report.detail ?? null,
    });
    return true;
  } catch (err) {
    console.error("shape watch could not record a report", err);
    return false;
  }
}
