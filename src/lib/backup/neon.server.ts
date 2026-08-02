/**
 * Connection layer for the independent disaster-recovery database.
 *
 * The DR target is a dedicated Neon project (costmyai-dr-backup) with its own
 * credentials. It is deliberately NOT the costmyai-ledger project: that one is
 * live production infrastructure for the billed-spend ledger and must never be
 * used as a restore target. The guard below refuses any connection string whose
 * host or database name looks like the ledger project, so a mis-pasted secret
 * fails loudly instead of overwriting production data.
 *
 * Neon is the destination rather than object storage because it supports real
 * point-in-time recovery and instant branching. That restores the restore-drill
 * capability that is structurally impossible on the platform itself.
 */

import { Client } from "@neondatabase/serverless";

export const DR_PROJECT_NAME = "costmyai-dr-backup";

/** Substrings that indicate the ledger project rather than the DR project. */
const FORBIDDEN_HOST_MARKERS = ["ledger"];

export type NeonConfig = { url: string; host: string; database: string };

export class ForbiddenTargetError extends Error {}

export function readNeonConfig(): NeonConfig | null {
  const url = process.env["NEON_DR_DATABASE_URL"];
  if (!url) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ForbiddenTargetError("NEON_DR_DATABASE_URL is not a valid connection string");
  }

  const host = parsed.hostname;
  const database = parsed.pathname.replace(/^\//, "");
  const haystack = `${host}/${database}`.toLowerCase();

  for (const marker of FORBIDDEN_HOST_MARKERS) {
    if (haystack.includes(marker)) {
      throw new ForbiddenTargetError(
        `Refusing to restore into "${haystack}": that looks like the costmyai-ledger production project, not ${DR_PROJECT_NAME}.`,
      );
    }
  }

  return { url, host, database };
}

async function withClient<T>(cfg: NeonConfig, fn: (c: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: cfg.url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

/**
 * Applies a logical dump to the DR database.
 *
 * The dump is written by public.backup_export_sql() and is already wrapped in
 * BEGIN/COMMIT. Existing copies of the exported tables are dropped first so the
 * restore is a faithful replacement rather than an append, and so the previous
 * run's append-only triggers cannot block the new load.
 */
export async function applyDump(
  cfg: NeonConfig,
  sql: string,
  tables: readonly string[],
): Promise<number> {
  const drops = tables.map((t) => `DROP TABLE IF EXISTS public."${t}" CASCADE;`).join("\n");
  const script = `${drops}\n${sql}`;
  await withClient(cfg, async (client) => {
    await client.query(script);
  });
  return script.split(";\n").length;
}

/** Row counts read back from the restored copy, keyed by table name. */
export async function readTargetCounts(
  cfg: NeonConfig,
  tables: readonly string[],
): Promise<Record<string, number>> {
  const union = tables
    .map((t) => `SELECT '${t}' AS t, count(*)::bigint AS n FROM public."${t}"`)
    .join(" UNION ALL ");
  return withClient(cfg, async (client) => {
    const res = await client.query(union);
    const out: Record<string, number> = {};
    for (const row of res.rows as Array<{ t: string; n: string | number }>) {
      out[row.t] = Number(row.n);
    }
    return out;
  });
}

export type TriggerRow = { table_name: string; trigger_name: string; enabled: boolean };

/**
 * Proof that the append-only guarantee travelled with the copy: the triggers on
 * monthly_kpi_snapshot and price_history must exist AND be enabled ('O' = origin,
 * i.e. fires normally; 'D' = disabled).
 */
export async function readTargetTriggers(cfg: NeonConfig): Promise<TriggerRow[]> {
  return withClient(cfg, async (client) => {
    const res = await client.query(`
      SELECT c.relname AS table_name, tg.tgname AS trigger_name, tg.tgenabled <> 'D' AS enabled
      FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND NOT tg.tgisinternal
      ORDER BY c.relname, tg.tgname
    `);
    return res.rows as TriggerRow[];
  });
}
