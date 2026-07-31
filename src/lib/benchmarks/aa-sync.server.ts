import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

import { AA_SUITE, transformAaPayload, type AaModel } from "./aa-catalog";

const AA_ENDPOINT = "https://artificialanalysis.ai/api/v2/data/llms/models";
const AA_FEED = "artificial_analysis";


export interface SyncReport {
  runId: string;
  fetchedModels: number;
  matchedModels: string[];
  unmatchedModels: string[];
  scoresWritten: number;
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

  const res = await fetch(AA_ENDPOINT, { headers: { "x-api-key": apiKey } });
  if (!res.ok) {
    throw new Error(`Artificial Analysis returned ${res.status}: ${await res.text()}`);
  }
  const payload = (await res.json()) as { data?: AaModel[] };
  const models = payload.data ?? [];
  if (models.length === 0) throw new Error("Artificial Analysis returned no models");

  const supabase = adminClient();
  const runId = `aa-${new Date().toISOString()}`;
  const syncedAt = new Date().toISOString();

  const { data: catalog, error: catalogError } = await supabase
    .from("model_catalog")
    .select("model_key");
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
  // the numbers behind a recommendation were last measured.
  await supabase.from("pricing_snapshots").insert({
    feed: AA_FEED,
    status: "ok",
    rows_upserted: result.scores.length + result.margins.length,
    is_fixture: false,
    synced_at: syncedAt,
  });

  return {
    runId,
    fetchedModels: models.length,
    matchedModels: result.matchedModels,
    unmatchedModels: result.unmatchedModels,
    scoresWritten: result.scores.length,
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

