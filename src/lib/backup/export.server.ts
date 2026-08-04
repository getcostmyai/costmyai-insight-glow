/**
 * Off-platform disaster-recovery restore.
 *
 * Every run takes a full logical export of the five tables that cannot be
 * reconstructed from anywhere else (organizations, subscriptions,
 * commission_ledger, monthly_kpi_snapshot, price_history) and restores it into
 * an independent Neon project, costmyai-dr-backup, whose credentials are shared
 * with neither this platform nor the costmyai-ledger production project.
 *
 * Why a live database instead of dump files in object storage: the platform's
 * own snapshots are ~14 days, daily, restore-in-place over production, and
 * irreversible, and there is no self-serve point-in-time recovery. A Neon copy
 * is independently restorable AND branchable to a point in time, which makes the
 * restore drill possible at all. Retention is therefore Neon's own history on
 * that project rather than a rolling window of files.
 *
 * The export carries types, trigger functions, table structure, constraints,
 * indexes, rows, and the append-only triggers last, so the copy inherits the
 * guarantee and not just the data.
 */

import {
  readNeonConfig,
  applyDump,
  readTargetCounts,
  readTargetTriggers,
  DR_PROJECT_NAME,
  type TriggerRow,
} from "./neon.server";

export const DR_TABLES = [
  "organizations",
  "subscriptions",
  "commission_ledger",
  "monthly_kpi_snapshot",
  "price_history",
] as const;

/** Tables whose append-only trigger must survive the restore. */
export const APPEND_ONLY_TABLES = ["monthly_kpi_snapshot", "price_history"] as const;

export type ExportResult = {
  ok: boolean;
  project?: string;
  destination?: string;
  statements?: number;
  bytes?: number;
  rowCounts?: Record<string, number>;
  targetRowCounts?: Record<string, number>;
  countsMatch?: boolean;
  triggersOk?: boolean;
  triggers?: TriggerRow[];
  startedAt: string;
  finishedAt: string;
  error?: string;
};

function countsMatch(a: Record<string, number>, b: Record<string, number>): boolean {
  return DR_TABLES.every((t) => Number(a[t] ?? -1) === Number(b[t] ?? -2));
}

function triggersPresent(rows: TriggerRow[]): boolean {
  return APPEND_ONLY_TABLES.every((t) =>
    rows.some((r) => r.table_name === t && r.enabled),
  );
}

export async function runBackupExport(): Promise<ExportResult> {
  const startedAt = new Date();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let cfg: ReturnType<typeof readNeonConfig> = null;
  let configError: string | null = null;
  try {
    cfg = readNeonConfig();
  } catch (err) {
    configError = err instanceof Error ? err.message : String(err);
  }

  const run = await supabaseAdmin
    .from("backup_export_runs")
    .insert({ started_at: startedAt.toISOString(), destination: cfg?.host ?? null })
    .select("id")
    .single();
  // Dispatch 91. Without this row the restore runs unrecorded and the job
  // ledger reports a schedule that never fired.
  if (run.error) throw new Error(`could not open a backup run record: ${run.error.message}`);
  const runId = run.data?.id as string | undefined;

  const fail = async (error: string): Promise<ExportResult> => {
    const finishedAt = new Date();
    if (runId) {
      await supabaseAdmin
        .from("backup_export_runs")
        .update({ finished_at: finishedAt.toISOString(), ok: false, error })
        .eq("id", runId);
    }
    console.error("DR restore failed:", error);
    return {
      ok: false,
      error,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
    };
  };

  if (configError) return fail(configError);
  if (!cfg) {
    return fail(
      `Off-platform destination is not configured. Set NEON_DR_DATABASE_URL to the connection string of the ${DR_PROJECT_NAME} Neon project.`,
    );
  }

  try {
    const counts = await supabaseAdmin.rpc("backup_export_counts");
    if (counts.error) return fail(`row counts failed: ${counts.error.message}`);

    const dump = await supabaseAdmin.rpc("backup_export_sql");
    if (dump.error) return fail(`export failed: ${dump.error.message}`);
    const sql = dump.data as unknown as string;
    if (!sql || sql.length < 100) return fail("export produced an empty payload");

    const statements = await applyDump(cfg, sql, DR_TABLES);
    const targetRowCounts = await readTargetCounts(cfg, DR_TABLES);
    const triggers = await readTargetTriggers(cfg);

    const rowCounts = counts.data as unknown as Record<string, number>;
    const match = countsMatch(rowCounts, targetRowCounts);
    const triggersOk = triggersPresent(triggers);

    const finishedAt = new Date();
    if (runId) {
      await supabaseAdmin
        .from("backup_export_runs")
        .update({
          finished_at: finishedAt.toISOString(),
          ok: match && triggersOk,
          object_key: `${DR_PROJECT_NAME}/${cfg.database}`,
          bytes: sql.length,
          statements,
          row_counts: rowCounts,
          target_row_counts: targetRowCounts,
          counts_match: match,
          triggers_ok: triggersOk,
          error: match && triggersOk ? null : "restored copy did not verify",
        })
        .eq("id", runId);
    }

    return {
      ok: match && triggersOk,
      project: DR_PROJECT_NAME,
      destination: cfg.host,
      statements,
      bytes: sql.length,
      rowCounts,
      targetRowCounts,
      countsMatch: match,
      triggersOk,
      triggers,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      ...(match && triggersOk ? {} : { error: "restored copy did not verify" }),
    };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}
