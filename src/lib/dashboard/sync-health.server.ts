/**
 * Sync-health interlock for the month-end projection.
 *
 * This reads the same signal the platform already uses to prove the collectors
 * ran — the `sync_runs` ledger written by `recordSyncRun` in
 * `src/lib/engine/evaluate.server.ts` — rather than inventing a second health
 * check that could disagree with it. A calendar day with no successful run is
 * a day the platform did not collect. The forecaster must treat that as an
 * unknown day, not as a quiet one.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

const DAY_MS = 86_400_000;

function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Return the UTC days inside the trailing level window for which the
 * `sync_runs` ledger holds no successful run at all.
 */
export async function syncGapDays(
  supabase: SupabaseClient<Database>,
  nowMs: number,
  levelDays: number,
): Promise<string[]> {
  const todayMs = Date.parse(`${dayKey(nowMs)}T00:00:00.000Z`);
  const windowStart = new Date(todayMs - levelDays * DAY_MS).toISOString();

  const { data, error } = await supabase
    .from("sync_runs")
    .select("started_at, ok")
    .gte("started_at", windowStart)
    .eq("ok", true)
    .limit(10_000);
  // A failed read is not evidence of a gap. Stay silent rather than suppress
  // a projection because of our own query error.
  if (error) return [];

  const healthy = new Set((data ?? []).map((r) => String(r.started_at).slice(0, 10)));
  const gaps: string[] = [];
  for (let i = levelDays; i >= 1; i--) {
    const d = dayKey(todayMs - i * DAY_MS);
    if (!healthy.has(d)) gaps.push(d);
  }
  return gaps;
}
