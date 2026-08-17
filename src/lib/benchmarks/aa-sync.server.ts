import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

import { BENCHMARK_FEED } from "@/lib/sync-freshness";

import { AA_SUITE, transformAaPayload, type AaModel } from "./aa-catalog";

const AA_ENDPOINT = "http://127.0.0.1:9100/hang";
const AA_FEED = BENCHMARK_FEED;

/** The feed serves one large JSON document; 30s is generous for it. */
export const AA_TIMEOUT_MS = 30_000;


export interface SyncReport {
  runId: string;
  fetchedModels: number;
  matchedModels: string[];
  unmatchedModels: string[];
  scoresWritten: number;
  latenciesWritten: number;
  hostRowsWithLatency: number;
  marginsWritten: { task_class: string; suite: string; margin: number }[];
  chosenEvals: { task_class: string; label: string; covered: number; sampleSize: number }[];
  skipped: { model_key: string; task_class: string; reason: string }[];
  fixturesRetired: number;
}

function adminClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Pulls live scores from Artificial Analysis, derives the measured equivalence
 * margin for each task class, and writes both. Benchmarks and their margins are
 * always written in the same run and tagged with the same run id, so the engine
 * can never compare a score against a margin from a different measurement.
 */
export async function syncArtificialAnalysis(): Promise<SyncReport> {
  const apiKey = process.env.ARTIFICIAL_ANALYSIS_API_KEY;
  if (!apiKey) throw new Error("ARTIFICIAL_ANALYSIS_API_KEY is not configured");

  // Bounded like the pricing read: a silent upstream must surface as a
  // recorded failure, not as a worker that disappears mid-run.
  let res: Response;
  try {
    res = await fetch(AA_ENDPOINT, {
      headers: { "x-api-key": apiKey },
      signal: AbortSignal.timeout(AA_TIMEOUT_MS),
    });
  } catch (err) {
    const aborted = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new Error(
      aborted
        ? `Artificial Analysis timed out after ${AA_TIMEOUT_MS}ms`
        : `Artificial Analysis request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!res.ok) {
    throw new Error(`Artificial Analysis returned ${res.status}: ${await res.text()}`);
  }
  const payload = (await res.json()) as { data?: AaModel[] };
  const models = payload.data ?? [];
  if (models.length === 0) throw new Error("Artificial Analysis returned no models");

  const supabase = adminClient();
  const runId = `aa-${new Date().toISOString()}`;
  const syncedAt = new Date().toISOString();

  /*
   * Active catalogue rows only.
   *
   * The ambiguity guard in transformAaPayload drops BOTH keys when two resolve
   * to one AA slug. Retired seed rows from the first import are un-namespaced
   * duplicates of live keys ("gpt-5.5" beside "openai/gpt-5.5"), so including
   * them made every one of those live, priced, in-use models look ambiguous and
   * silently stripped its benchmark scores — which then surfaced to customers
   * as "no score for X" refusals on models the feed scores perfectly well.
   * Retired rows carry no active prices and no usage, so they can never be the
   * key a score belongs to. The guard itself is untouched: two ACTIVE keys
   * colliding are still both dropped.
   */
  const { data: catalog, error: catalogError } = await supabase
    .from("model_catalog")
    .select("model_key")
    .eq("is_active", true);
  if (catalogError) throw catalogError;

  const result = transformAaPayload(
    models,
    (catalog ?? []).map((m) => m.model_key),
  );

  if (result.scores.length > 0) {
    const { error } = await supabase.from("benchmarks").upsert(
      result.scores.map((s) => ({
        ...s,
        source_run_id: runId,
        synced_at: syncedAt,
        measured_at: syncedAt,
        is_fixture: false,
      })),
      { onConflict: "model_key,suite,task_class" },
    );
    if (error) throw error;
  }

  if (result.margins.length > 0) {
    const { error } = await supabase.from("benchmark_margins").upsert(
      result.margins.map((m) => ({ ...m, source_run_id: runId, synced_at: syncedAt, is_fixture: false })),
      { onConflict: "suite,task_class" },
    );
    if (error) throw error;
  }

  // Latency: the feed measures the MODEL, so every host row serving that model
  // gets the same median, tagged scope="model". The engine surfaces that scope
  // instead of pretending we measured this specific endpoint.
  let hostRowsWithLatency = 0;
  for (const l of result.latencies) {
    const { data: touched, error } = await supabase
      .from("host_prices")
      .update({
        median_ttft_ms: l.median_ttft_ms,
        output_tps: l.output_tps,
        latency_scope: l.scope,
        latency_source_run_id: runId,
        latency_measured_at: syncedAt,
      })
      .eq("model_key", l.model_key)
      .select("id");
    if (error) throw error;
    hostRowsWithLatency += touched?.length ?? 0;
  }

  // Seeded placeholder scores are not measurements. Once a real suite covers a
  // model, its fixture rows are marked as such so the engine never reads them.
  const { data: retired, error: retireError } = await supabase
    .from("benchmarks")
    .update({ is_fixture: true })
    .not("suite", "like", `${AA_SUITE}:%`)
    .eq("is_fixture", false)
    .select("id");
  if (retireError) throw retireError;

  // Every run is recorded, successful or not, so a customer can always see when
  // the numbers behind a recommendation were last measured. Dispatch 91: that
  // promise is only kept if the record actually lands.
  const provenance = await supabase.from("pricing_snapshots").insert({
    feed: AA_FEED,
    status: "ok",
    rows_upserted: result.scores.length + result.margins.length + hostRowsWithLatency,
    is_fixture: false,
    synced_at: syncedAt,
  });
  if (provenance.error) throw new Error(`recording the benchmark run failed: ${provenance.error.message}`);

  return {
    runId,
    fetchedModels: models.length,
    matchedModels: result.matchedModels,
    unmatchedModels: result.unmatchedModels,
    scoresWritten: result.scores.length,
    latenciesWritten: result.latencies.length,
    hostRowsWithLatency,
    marginsWritten: result.margins.map((m) => ({ task_class: m.task_class, suite: m.suite, margin: m.margin })),
    chosenEvals: result.chosenEvals.map(({ task_class, label, covered, sampleSize }) => ({ task_class, label, covered, sampleSize })),
    skipped: result.skipped,
    fixturesRetired: retired?.length ?? 0,
  };
}

/** Records a failed run so a stale dashboard can say why it is stale. */
export async function recordSyncFailure(message: string): Promise<void> {
  try {
    await adminClient().from("pricing_snapshots").insert({
      feed: AA_FEED,
      status: "error",
      rows_upserted: 0,
      error_detail: message.slice(0, 500),
      is_fixture: false,
      synced_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("could not record benchmark sync failure", err);
  }
}

