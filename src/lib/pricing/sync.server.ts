import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

import {
  diffPrice,
  DELIST_GRACE_MISSES,
  OPENROUTER_SOURCE,
  SOURCE_PRIORITY,
  transformCatalog,
  transformEndpoints,
  type CatalogEntry,
  type OrEndpoint,
  type OrModel,
  type PriceChange,
  type PriceEntry,
  type SkippedEntry,
  type StoredPrice,
} from "./openrouter";

const OR_MODELS_URL = "https://openrouter.ai/api/v1/models";
export const PRICING_FEED = "openrouter";

/**
 * Buying the model through OpenRouter itself is a real, purchasable option, so
 * the aggregated price is stored as its own host rather than being blended into
 * a provider's row. Ranked below the per-provider endpoint prices, which are
 * the more specific measurement of the same market.
 */
export const AGGREGATE_SOURCE = "openrouter-aggregate";
export const AGGREGATE_PRIORITY = 60;
export const AGGREGATE_HOST = "openrouter";
export const AGGREGATE_HOST_LABEL = "OpenRouter";

/**
 * Models whose per-provider endpoints are refreshed per run. The catalogue call
 * is one request; the endpoint sweep is one request per model, so it rotates
 * oldest-first and completes a full pass roughly every 25 minutes at a
 * 3-minute cadence. Prices move on the scale of weeks, not minutes — this is
 * comfortably faster than the market it tracks.
 */
export const ENDPOINT_SWEEP_SIZE = 40;

/** A run older than this is assumed dead, not still working. */
export const RUN_LOCK_MS = 3 * 60_000;

export interface PriceSyncReport {
  runId: string;
  fetchedModels: number;
  modelsImported: number;
  modelsNew: number;
  endpointsSwept: number;
  priceRowsWritten: number;
  changesRecorded: { new: number; increase: number; decrease: number; delisted: number; relisted: number };
  delisted: number;
  skipped: SkippedEntry[];
  durationMs: number;
}

function adminClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type Admin = ReturnType<typeof adminClient>;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`OpenRouter ${url} returned ${res.status}`);
  return (await res.json()) as T;
}

function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/** True when another run started less than one interval ago and has not finished. */
async function isLocked(supabase: Admin): Promise<boolean> {
  const { data } = await supabase
    .from("pricing_snapshots")
    .select("synced_at, finished_at, status")
    .eq("feed", PRICING_FEED)
    .eq("status", "running")
    .order("synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return false;
  if (data.finished_at) return false;
  return Date.now() - new Date(data.synced_at).getTime() < RUN_LOCK_MS;
}

/**
 * Pulls the whole OpenRouter catalogue, imports every usable model, refreshes a
 * rotating slice of per-provider prices, and records a price_history row only
 * where a value genuinely moved.
 */
export async function syncOpenRouterPricing(): Promise<PriceSyncReport | { skipped: "locked" }> {
  const started = Date.now();
  const supabase = adminClient();

  if (await isLocked(supabase)) return { skipped: "locked" };

  const runId = `or-${new Date().toISOString()}`;
  const syncedAt = new Date().toISOString();

  const { data: runRow } = await supabase
    .from("pricing_snapshots")
    .insert({
      feed: PRICING_FEED,
      status: "running",
      rows_upserted: 0,
      is_fixture: false,
      synced_at: syncedAt,
      run_id: runId,
    })
    .select("id")
    .single();

  try {
    // 1. Catalogue -------------------------------------------------------
    const payload = await fetchJson<{ data?: OrModel[] }>(OR_MODELS_URL);
    const models = payload.data ?? [];
    if (models.length === 0) throw new Error("OpenRouter returned no models");

    const { entries, skipped } = transformCatalog(models);

    const { data: existingModels } = await supabase.from("model_catalog").select("model_key");
    const known = new Set((existingModels ?? []).map((m) => m.model_key));
    const modelsNew = entries.filter((e) => !known.has(e.model_key)).length;

    await upsertCatalog(supabase, entries, syncedAt);

    // Every imported model is an alias of itself, so downstream resolution is total.
    for (const batch of chunk(entries, 500)) {
      await supabase
        .from("model_aliases")
        .upsert(
          batch.map((e) => ({ alias: e.model_key, model_key: e.model_key, source: OPENROUTER_SOURCE })),
          { onConflict: "alias" },
        );
    }

    // 2. Aggregated reference price, one row per model --------------------
    const aggregate: PriceEntry[] = entries.map((e) => ({
      model_key: e.model_key,
      host: AGGREGATE_HOST,
      host_label: AGGREGATE_HOST_LABEL,
      region: "global",
      input_usd_per_mtok: e.referenceInput,
      output_usd_per_mtok: e.referenceOutput,
      price_source: AGGREGATE_SOURCE,
      source_priority: AGGREGATE_PRIORITY,
      external_id: e.external_id,
    }));

    // 3. Per-provider sweep, oldest first ---------------------------------
    const { data: sweepTargets } = await supabase
      .from("model_catalog")
      .select("model_key")
      .eq("source", OPENROUTER_SOURCE)
      .eq("is_active", true)
      // Rotation is tracked on its own column: last_seen_at is refreshed for the
      // whole catalogue by every run, so ordering on it would never advance.
      .order("endpoints_synced_at", { ascending: true, nullsFirst: true })
      .limit(ENDPOINT_SWEEP_SIZE);

    const endpointPrices: PriceEntry[] = [];
    let endpointsSwept = 0;
    for (const target of sweepTargets ?? []) {
      try {
        const res = await fetchJson<{ data?: { endpoints?: OrEndpoint[] } }>(
          `${OR_MODELS_URL}/${target.model_key}/endpoints`,
        );
        const { prices, skipped: epSkipped } = transformEndpoints(
          target.model_key,
          res.data?.endpoints ?? [],
        );
        endpointPrices.push(...prices);
        skipped.push(...epSkipped);
        endpointsSwept += 1;
      } catch (err) {
        // One unreachable model must not abort the run: the rest of the
        // catalogue is still real and still worth writing.
        skipped.push({ id: target.model_key, reason: `endpoints unavailable: ${String(err)}` });
      }
    }

    // Mark swept models as seen so the rotation advances even when a model has
    // no usable endpoints, otherwise the sweep would stall on it forever.
    for (const batch of chunk((sweepTargets ?? []).map((t) => t.model_key), 200)) {
      const { error } = await supabase
        .from("model_catalog")
        .update({ endpoints_synced_at: syncedAt })
        .in("model_key", batch);
      // A silent failure here would freeze the rotation on one slice of the
      // catalogue while the run still reported success.
      if (error) throw error;
    }

    // 4. Diff, write history, upsert prices --------------------------------
    const incoming = [...aggregate, ...endpointPrices];
    const changes = await writePrices(supabase, incoming, runId, syncedAt);
    // Only models actually looked at this run may be delisted. The endpoint
    // sweep covers a rotating slice, so judging every stored row against one
    // run's incoming set would delist the entire catalogue every few minutes.
    const sweptKeys = new Set((sweepTargets ?? []).map((t) => t.model_key));
    const inScope = (row: { model_key: string; price_source: string }) =>
      row.price_source === AGGREGATE_SOURCE || sweptKeys.has(row.model_key);
    const delisted = await delistMissing(supabase, incoming, runId, syncedAt, inScope);

    const tally = { new: 0, increase: 0, decrease: 0, delisted, relisted: 0 };
    for (const c of changes) tally[c.change_kind] += 1;

    const report: PriceSyncReport = {
      runId,
      fetchedModels: models.length,
      modelsImported: entries.length,
      modelsNew,
      endpointsSwept,
      priceRowsWritten: incoming.length,
      changesRecorded: tally,
      delisted,
      skipped: skipped.slice(0, 50),
      durationMs: Date.now() - started,
    };

    if (runRow) {
      await supabase
        .from("pricing_snapshots")
        .update({
          status: "ok",
          rows_upserted: incoming.length,
          models_upserted: entries.length,
          price_changes: changes.length,
          finished_at: new Date().toISOString(),
        })
        .eq("id", runRow.id);
    }

    return report;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (runRow) {
      await supabase
        .from("pricing_snapshots")
        .update({ status: "error", error_detail: message.slice(0, 500), finished_at: new Date().toISOString() })
        .eq("id", runRow.id);
    }
    throw err;
  }
}

async function upsertCatalog(supabase: Admin, entries: CatalogEntry[], syncedAt: string) {
  for (const batch of chunk(entries, 250)) {
    const { error } = await supabase.from("model_catalog").upsert(
      batch.map((e) => ({
        model_key: e.model_key,
        display_name: e.display_name,
        vendor: e.vendor,
        tier: e.tier,
        context_window: e.context_window,
        is_reasoning: e.is_reasoning,
        modality: e.modality,
        external_id: e.external_id,
        source: e.source,
        is_active: true,
        last_seen_at: syncedAt,
        updated_at: syncedAt,
      })),
      { onConflict: "model_key" },
    );
    if (error) throw error;
  }
}

/**
 * Writes prices and, separately, the history of what actually moved. The two
 * are written in the same run against the same read, so a history row can never
 * describe a price the table does not hold.
 */
async function writePrices(
  supabase: Admin,
  incoming: PriceEntry[],
  runId: string,
  syncedAt: string,
): Promise<PriceChange[]> {
  if (incoming.length === 0) return [];

  const sources = [...new Set(incoming.map((p) => p.price_source))];
  const { data: existing, error: readError } = await readAllPrices(supabase, sources);
  if (readError) throw readError;

  const prevIndex = new Map<string, StoredPrice>();
  for (const row of existing) {
    prevIndex.set(`${row.model_key}|${row.host}|${row.region}|${row.price_source}`, {
      input_usd_per_mtok: Number(row.input_usd_per_mtok),
      output_usd_per_mtok: Number(row.output_usd_per_mtok),
      is_active: row.is_active,
    });
  }

  const changes: PriceChange[] = [];
  for (const p of incoming) {
    const change = diffPrice(p, prevIndex.get(`${p.model_key}|${p.host}|${p.region}|${p.price_source}`));
    if (change) changes.push(change);
  }

  for (const batch of chunk(incoming, 500)) {
    const { error } = await supabase.from("host_prices").upsert(
      batch.map((p) => ({
        model_key: p.model_key,
        host: p.host,
        host_label: p.host_label,
        region: p.region,
        input_usd_per_mtok: p.input_usd_per_mtok,
        output_usd_per_mtok: p.output_usd_per_mtok,
        price_source: p.price_source,
        source_priority: p.source_priority,
        external_id: p.external_id,
        is_active: true,
        missed_syncs: 0,
        is_fixture: false,
        verified_at: syncedAt,
        last_seen_at: syncedAt,
      })),
      { onConflict: "model_key,host,region,price_source" },
    );
    if (error) throw error;
  }

  for (const batch of chunk(changes, 500)) {
    const { error } = await supabase
      .from("price_history")
      .insert(batch.map((c) => ({ ...c, sync_run_id: runId, observed_at: syncedAt })));
    if (error) throw error;
  }

  return changes;
}

/**
 * Rows this source stopped publishing. Never hard-deleted: a deleted price
 * destroys the evidence behind a recommendation that was already made on it.
 */
async function delistMissing(
  supabase: Admin,
  incoming: PriceEntry[],
  runId: string,
  syncedAt: string,
  inScope: (row: { model_key: string; price_source: string }) => boolean,
): Promise<number> {
  const sources = [...new Set(incoming.map((p) => p.price_source))];
  const seen = new Set(incoming.map((p) => `${p.model_key}|${p.host}|${p.region}|${p.price_source}`));
  const { data: existing } = await readAllPrices(supabase, sources);

  const missing = existing.filter(
    (r) =>
      r.is_active &&
      inScope(r) &&
      !seen.has(`${r.model_key}|${r.host}|${r.region}|${r.price_source}`),
  );
  if (missing.length === 0) return 0;

  let delisted = 0;
  const history: Record<string, unknown>[] = [];

  for (const row of missing) {
    const misses = (row.missed_syncs ?? 0) + 1;
    if (misses >= DELIST_GRACE_MISSES) {
      delisted += 1;
      history.push({
        model_key: row.model_key,
        host: row.host,
        region: row.region,
        price_source: row.price_source,
        change_kind: "delisted",
        prev_input_usd_per_mtok: Number(row.input_usd_per_mtok),
        prev_output_usd_per_mtok: Number(row.output_usd_per_mtok),
        sync_run_id: runId,
        observed_at: syncedAt,
      });
      const delist = await supabase
        .from("host_prices")
        .update({ is_active: false, missed_syncs: misses })
        .eq("id", row.id);
      if (delist.error) throw new Error(`delisting ${row.model_key}@${row.host} failed: ${delist.error.message}`);
    } else {
      const miss = await supabase.from("host_prices").update({ missed_syncs: misses }).eq("id", row.id);
      if (miss.error) throw new Error(`miss counter for ${row.id} failed: ${miss.error.message}`);
    }
  }

  for (const batch of chunk(history, 500)) {
    // Dispatch 91. price_history is append-only and permanent; a dropped
    // batch is a hole in the record that nothing later can reconstruct.
    const { error } = await supabase.from("price_history").insert(batch as never);
    if (error) throw new Error(`price history append failed: ${error.message}`);
  }

  return delisted;
}

/**
 * Paged read of every price row for the given sources.
 *
 * PostgREST caps an unbounded select at 1000 rows and returns the truncation
 * silently. At real catalogue scale that would make the diff compare against an
 * arbitrary slice — inventing "new" and "changed" rows out of pagination.
 */
async function readAllPrices(supabase: Admin, sources: string[]) {
  const page = 1000;
  const rows: {
    id: string;
    model_key: string;
    host: string;
    region: string;
    price_source: string;
    input_usd_per_mtok: number;
    output_usd_per_mtok: number;
    is_active: boolean;
    missed_syncs: number;
  }[] = [];

  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from("host_prices")
      .select("id, model_key, host, region, price_source, input_usd_per_mtok, output_usd_per_mtok, is_active, missed_syncs")
      .in("price_source", sources)
      .order("id", { ascending: true })
      .range(from, from + page - 1);
    if (error) return { data: rows, error };
    rows.push(...((data ?? []) as typeof rows));
    if (!data || data.length < page) break;
  }

  return { data: rows, error: null };
}

/** Records a failed run so a stale page can say why it is stale. */
export async function recordPriceSyncFailure(message: string): Promise<void> {
  try {
    await adminClient().from("pricing_snapshots").insert({
      feed: PRICING_FEED,
      status: "error",
      rows_upserted: 0,
      error_detail: message.slice(0, 500),
      is_fixture: false,
      synced_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("could not record pricing sync failure", err);
  }
}
