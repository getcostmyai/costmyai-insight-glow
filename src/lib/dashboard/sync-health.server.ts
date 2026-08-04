import {
  classifySyncHealth,
  USAGE_COLLECTOR_JOBS,
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
 * classifier treats it as no observation at all. The 1 August 2026 shape — a
 * collector reporting success while nothing landed — is now a state the
 * projection can see and refuse on.
 *
 * Only usage collectors answer here. A healthy pricing sync says nothing about
 * whether usage was collected, and letting it vote is precisely how that day
 * passed as healthy.
 */

const DAY_MS = 86_400_000;

function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Full per-day health for the trailing level window. */
export async function syncHealth(nowMs: number, levelDays: number): Promise<SyncHealthResult> {
  const todayMs = Date.parse(`${dayKey(nowMs)}T00:00:00.000Z`);
  const windowStart = new Date(todayMs - levelDays * DAY_MS).toISOString();

  // The ledger is platform-only, so the read runs with the admin client, loaded
  // inside the function so the module never enters a client bundle. Nothing
  // org-scoped is read: the answer is a list of calendar days.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("sync_runs")
    .select("job, started_at, ok, outcome")
    .in("job", [...USAGE_COLLECTOR_JOBS])
    .gte("started_at", windowStart)
    .limit(10_000);

  // A failed read is not evidence of a gap. Stay silent rather than suppress a
  // real projection because of our own blind spot.
  if (error || !data) return { gapDays: [], emptyDays: [], byDay: {} };

  return classifySyncHealth(data as unknown as RunLedgerRow[], nowMs, levelDays);
}

/**
 * Return the UTC days inside the trailing level window that the usage
 * collector did not observe — whether because nothing ran, the run failed, or
 * the run completed and wrote nothing on a day data was expected.
 */
export async function syncGapDays(nowMs: number, levelDays: number): Promise<string[]> {
  return (await syncHealth(nowMs, levelDays)).gapDays;
}
