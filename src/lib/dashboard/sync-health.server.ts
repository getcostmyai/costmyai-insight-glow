import {
  classifySyncHealth,
  type RunLedgerRow,
  type SyncHealthResult,
} from "./sync-health";

/**
 * Sync-health interlock for the month-end projection — the reading half.
 *
 * This reads the `sync_runs` ledger written by `recordRun` in
 * `src/lib/engine/evaluate.server.ts`. Since Dispatch 65 that ledger records
 * what each run produced, not just that it returned: a run that completed and
 * wrote zero rows on a day data was expected is stored as `empty`, and the
 * classifier treats it as no observation at all.
 *
 * Dispatch 172 fixes two real defects found in the Dispatch 171 audit.
 *
 * 1. The read was `.limit(10_000)` with no ordering. The demo ticker records a
 *    run a minute, so ten thousand rows is under seven days: on a long window
 *    the read silently returned an arbitrary slice and days that were fully
 *    observed came back as holes. The aggregation now happens in SQL
 *    (`public.usage_collector_days`), which returns at most a handful of rows
 *    per day — bounded by the window, never by history length, per the
 *    standing rule from Dispatch 163.
 *
 * 2. The read was not org-scoped, so every workspace inherited the synthetic
 *    demo ticker's verdict. A real org's projection must never be refused, or
 *    excused, by whether the demo generator ran. The ledger rows carry the org
 *    in `detail->>'orgId'`, and the RPC filters on it. For an org no collector
 *    reports on, the ledger is empty and every day is `unknown` — silence about
 *    an org is not evidence of a hole.
 */

const DAY_MS = 86_400_000;

function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

const EMPTY: SyncHealthResult = { gapDays: [], emptyDays: [], byDay: {} };

/** Full per-day health for the trailing level window, for one workspace. */
export async function syncHealth(
  orgId: string,
  nowMs: number,
  levelDays: number,
): Promise<SyncHealthResult> {
  const todayMs = Date.parse(`${dayKey(nowMs)}T00:00:00.000Z`);
  const windowStart = new Date(todayMs - levelDays * DAY_MS).toISOString();

  // The ledger is platform-only, so the read runs with the admin client, loaded
  // inside the function so the module never enters a client bundle.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("usage_collector_days", {
    _org_id: orgId,
    _since: windowStart,
  });

  // A failed read is not evidence of a gap. Stay silent rather than suppress a
  // real projection because of our own blind spot.
  if (error || !data) return EMPTY;

  // One synthetic ledger row per (day, outcome) pair. The classifier only ever
  // asks whether a day produced anything, so a per-day summary carries exactly
  // the same information as the raw runs it replaces.
  const rows: RunLedgerRow[] = (data as Array<{ day: string; outcome: string }>).map((r) => ({
    job: "usage-tick",
    started_at: `${String(r.day).slice(0, 10)}T12:00:00.000Z`,
    outcome: r.outcome,
    ok: r.outcome !== "failed",
  }));

  if (rows.length === 0) return EMPTY;

  return classifySyncHealth(rows, nowMs, levelDays);
}

/**
 * Return the UTC days inside the trailing level window that this workspace's
 * usage collector did not observe — whether because nothing ran, the run
 * failed, or the run completed and wrote nothing on a day data was expected.
 */
export async function syncGapDays(
  orgId: string,
  nowMs: number,
  levelDays: number,
): Promise<string[]> {
  return (await syncHealth(orgId, nowMs, levelDays)).gapDays;
}
