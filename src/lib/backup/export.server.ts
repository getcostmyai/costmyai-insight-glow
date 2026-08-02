/**
 * Off-platform export of the five tables that cannot be reconstructed:
 * organizations, subscriptions, commission_ledger, monthly_kpi_snapshot,
 * price_history.
 *
 * Context that makes this the primary safety net rather than defence in depth:
 * the platform's own snapshots are ~14 days, daily, restore-in-place over
 * production, and irreversible. Nothing older than two weeks is recoverable and
 * no restore can be tested without destroying current data. This mechanism can
 * be restored into an independent Postgres and therefore actually verified.
 *
 * The export is a real logical export: types, trigger functions, table
 * structure, constraints, indexes, every row, and the append-only triggers
 * last, so a restore rebuilds the guarantee and not just the data.
 */

import { readS3Config, putObject, listObjects, deleteObject } from "./s3.server";

export const RETENTION_DAYS = 90;
export const EXPORT_PREFIX = "costmyai/postgres/";

export type ExportResult = {
  ok: boolean;
  objectKey?: string;
  bytes?: number;
  destination?: string;
  rowCounts?: Record<string, number>;
  prunedKeys?: number;
  startedAt: string;
  finishedAt: string;
  error?: string;
};

function objectKeyFor(now: Date): string {
  const iso = now.toISOString().replace(/[:.]/g, "-");
  return `${EXPORT_PREFIX}${iso.slice(0, 10)}/costmyai-${iso.slice(0, 19)}Z.sql.gz`;
}

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

/** Drops exports older than RETENTION_DAYS. Never touches anything newer. */
async function prune(cfg: ReturnType<typeof readS3Config>): Promise<number> {
  if (!cfg) return 0;
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const keys = await listObjects(cfg, EXPORT_PREFIX);
  let pruned = 0;
  for (const key of keys) {
    const day = key.slice(EXPORT_PREFIX.length, EXPORT_PREFIX.length + 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    if (Date.parse(day + "T00:00:00Z") < cutoff) {
      await deleteObject(cfg, key);
      pruned += 1;
    }
  }
  return pruned;
}

export async function runBackupExport(): Promise<ExportResult> {
  const startedAt = new Date();
  const cfg = readS3Config();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const run = await supabaseAdmin
    .from("backup_export_runs")
    .insert({ started_at: startedAt.toISOString(), destination: cfg?.bucket ?? null })
    .select("id")
    .single();
  const runId = run.data?.id as string | undefined;

  const fail = async (error: string): Promise<ExportResult> => {
    const finishedAt = new Date();
    if (runId) {
      await supabaseAdmin
        .from("backup_export_runs")
        .update({ finished_at: finishedAt.toISOString(), ok: false, error })
        .eq("id", runId);
    }
    console.error("backup export failed:", error);
    return {
      ok: false,
      error,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
    };
  };

  if (!cfg) {
    return fail(
      "Off-platform destination is not configured. Set BACKUP_S3_ENDPOINT, BACKUP_S3_BUCKET, BACKUP_S3_ACCESS_KEY_ID and BACKUP_S3_SECRET_ACCESS_KEY.",
    );
  }

  try {
    const counts = await supabaseAdmin.rpc("backup_export_counts");
    if (counts.error) return fail(`row counts failed: ${counts.error.message}`);

    const dump = await supabaseAdmin.rpc("backup_export_sql");
    if (dump.error) return fail(`export failed: ${dump.error.message}`);
    const sql = dump.data as unknown as string;
    if (!sql || sql.length < 100) return fail("export produced an empty payload");

    const body = await gzip(sql);
    const objectKey = objectKeyFor(startedAt);
    await putObject(cfg, objectKey, body);

    let prunedKeys = 0;
    try {
      prunedKeys = await prune(cfg);
    } catch (err) {
      // A pruning failure must never make a good export look failed.
      console.error("backup pruning failed:", err instanceof Error ? err.message : String(err));
    }

    const finishedAt = new Date();
    const rowCounts = counts.data as unknown as Record<string, number>;
    if (runId) {
      await supabaseAdmin
        .from("backup_export_runs")
        .update({
          finished_at: finishedAt.toISOString(),
          ok: true,
          object_key: objectKey,
          bytes: body.byteLength,
          row_counts: rowCounts,
          pruned_keys: prunedKeys,
        })
        .eq("id", runId);
    }

    return {
      ok: true,
      objectKey,
      bytes: body.byteLength,
      destination: cfg.bucket,
      rowCounts,
      prunedKeys,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
    };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}
