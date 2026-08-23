/**
 * The schema-filter check as a standing job (Dispatch 111).
 *
 * Dispatch 88 built this as a script somebody runs. That is exactly the shape
 * of failure the standing audit exists to remove: the missing `is_active`
 * filter found in Dispatch 110 was not missed by the tool, it was simply
 * written after the last time a human ran it.
 *
 * So the check now runs inside the app, daily, on the same ledger and the same
 * /admin/jobs board as every collector. The source half is a manifest emitted
 * at commit time (`bun run audit:schema -- --emit`, kept honest by
 * `schema-filter-manifest.test.ts`); the database half — which tables carry
 * lifecycle columns, and which guards have gone live — is read fresh on every
 * run, because that is the half that changes without a deploy.
 */

import { recordRun } from "@/lib/engine/evaluate.server";

import { describeError } from "./errors";

import exemptions from "./schema-filter-exemptions.json";
import manifest from "./schema-filter-manifest.json";
import {
  DANGEROUS_PREDICATE,
  STATE_PREDICATES,
  MANIFEST_VERSION,
  evaluateManifest,
  type Evaluation,
  type Exemption,
  type SchemaFilterManifest,
} from "./schema-filters";

export const SCHEMA_FILTER_JOB = "schema-filters";

export interface SchemaFilterRunResult extends Evaluation {
  manifestGeneratedAt: string;
  summary: string;
}

export async function runSchemaFilterCheck(): Promise<SchemaFilterRunResult> {
  const typed = manifest as SchemaFilterManifest;
  if (typed.version !== MANIFEST_VERSION) {
    throw new Error(
      `schema-filter manifest is version ${typed.version}, this build expects ${MANIFEST_VERSION}`,
    );
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("schema_filter_state" as never, {
    _predicates: STATE_PREDICATES,
  } as never);
  // Rethrown as a real Error: the raw PostgrestError is a plain object and
  // stringifies to "[object Object]" wherever it is later recorded.
  if (error) throw new Error(`schema_filter_state failed: ${describeError(error)}`);

  const state = data as unknown as {
    columns: { table: string; column: string }[];
    live: string[];
  };

  const tableColumns = new Map<string, string[]>();
  for (const row of state.columns ?? []) {
    tableColumns.set(row.table, [...(tableColumns.get(row.table) ?? []), row.column]);
  }

  const result = evaluateManifest({
    manifest: typed,
    tableColumns,
    // Advisory predicates are only there to enumerate columns; a live guard is
    // only ever one of the four that can promote a finding.
    liveGuards: new Set((state.live ?? []).filter((g) => g.split(".")[1]! in DANGEROUS_PREDICATE)),
    exemptions: exemptions as Exemption[],
  });

  return {
    ...result,
    manifestGeneratedAt: typed.generatedAt,
    summary: `${result.required.length} required / ${result.advisory.length} advisory across ${result.queriesChecked} read queries on ${result.tablesWatched} tables`,
  };
}

/** Run the check and record it on the ledger the jobs board reads. */
export async function runAndRecordSchemaFilterCheck(): Promise<SchemaFilterRunResult> {
  const started = new Date();
  try {
    const result = await runSchemaFilterCheck();
    await recordRun({
      job: SCHEMA_FILTER_JOB,
      started,
      // A gap is a real failure of the guarantee, not of the job — but the
      // board's red is the only place anybody would see it, so it goes red.
      outcome: result.required.length > 0 ? "failed" : "ok",
      rowsWritten: result.queriesChecked,
      error:
        result.required.length > 0
          ? result.required
              .slice(0, 5)
              .map((f) => `${f.file}:${f.line} ${f.table}.${f.column} — ${f.why}`)
              .join(" | ")
          : undefined,
      detail: result as unknown as Record<string, unknown>,
    });
    return result;
  } catch (err) {
    const message = describeError(err);
    await recordRun({
      job: SCHEMA_FILTER_JOB,
      started,
      outcome: "failed",
      rowsWritten: 0,
      error: message,
    });
    throw err;
  }
}
