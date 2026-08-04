/**
 * Which calendar days the collectors actually observed — the pure half.
 *
 * Dispatch 65. The previous version of this check asked one question: "did any
 * job report ok on this day?" On 1 August 2026 the answer was yes 413 times,
 * from the pricing sync, while the usage collector wrote nothing. The check was
 * reading a ledger about a different pipeline than the data it guards, and a
 * boolean that only ever meant "the handler did not throw".
 *
 * Two things change here. The ledger is now read per collector, so the usage
 * collector answers for usage days and nothing else answers on its behalf. And
 * a run that completed while writing zero rows on a day data was expected —
 * outcome `empty` — is treated exactly like a day nothing ran. It is not
 * observation; it is a hole that happened to return 200.
 */

/** One run as the ledger holds it, reduced to what this check needs. */
export interface RunLedgerRow {
  job: string;
  started_at: string;
  outcome: string | null;
  ok: boolean;
}

/** Jobs whose runs are evidence that usage data was collected for a day. */
export const USAGE_COLLECTOR_JOBS = ["usage-tick"] as const;

const DAY_MS = 86_400_000;

export function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Per-day verdict, kept explicit so "ok but empty" is never collapsed into either neighbour. */
export type DayHealth = "observed" | "empty" | "absent" | "unknown";

export interface SyncHealthResult {
  /** Days the projection must treat as not observed. */
  gapDays: string[];
  /** Subset of gapDays where a run completed and wrote nothing anyway. */
  emptyDays: string[];
  /** Per-day verdicts, for evidence and tests. */
  byDay: Record<string, DayHealth>;
}

/**
 * Classify each day of the trailing window from the run ledger.
 *
 * `ledgerStart` is the first day the usage collector ever recorded a run.
 * Before it, this ledger has nothing to say and the day is `unknown` — silence
 * about the past is not evidence of a hole, and refusing on it would suppress
 * every projection the moment the collector started reporting.
 */
export function classifySyncHealth(
  rows: RunLedgerRow[],
  nowMs: number,
  levelDays: number,
): SyncHealthResult {
  const todayMs = Date.parse(`${dayKey(nowMs)}T00:00:00.000Z`);
  const usage = rows.filter((r) =>
    (USAGE_COLLECTOR_JOBS as readonly string[]).includes(r.job),
  );

  // Runs recorded before the outcome column existed carry a bare boolean. They
  // cannot answer the empty question, so they only ever count as `unknown`.
  const dated = usage.filter((r) => r.outcome !== null);
  const ledgerStart = dated.length
    ? dated.map((r) => String(r.started_at).slice(0, 10)).sort()[0]!
    : null;

  const produced = new Set<string>();
  const ran = new Set<string>();
  for (const r of dated) {
    const d = String(r.started_at).slice(0, 10);
    ran.add(d);
    // `ok` wrote rows; `quiet` is a collector explicitly stating there was
    // nothing to write. Both are observation. `empty` and `failed` are not.
    if (r.outcome === "ok" || r.outcome === "quiet") produced.add(d);
  }

  const byDay: Record<string, DayHealth> = {};
  const gapDays: string[] = [];
  const emptyDays: string[] = [];

  for (let i = levelDays; i >= 1; i--) {
    const d = dayKey(todayMs - i * DAY_MS);
    if (!ledgerStart || d < ledgerStart) {
      byDay[d] = "unknown";
      continue;
    }
    if (produced.has(d)) {
      byDay[d] = "observed";
      continue;
    }
    if (ran.has(d)) {
      byDay[d] = "empty";
      emptyDays.push(d);
    } else {
      byDay[d] = "absent";
    }
    gapDays.push(d);
  }

  return { gapDays, emptyDays, byDay };
}
