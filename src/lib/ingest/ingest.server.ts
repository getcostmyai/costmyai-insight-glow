import { createClient } from "@supabase/supabase-js";
import { createHash, timingSafeEqual } from "crypto";

import type { Database } from "@/integrations/supabase/types";
import { costOf } from "@/lib/engine/cost";
import type { PriceRow } from "@/lib/engine/types";
import { bucketStart, DAY_MS, rollupEvents, type SyntheticEvent } from "@/lib/synthetic/generator";

import { buildModelResolver } from "./resolve";
import { buildHostResolver } from "./resolve-host";
import type { IngestEvent } from "./schema";
import { fetchAllRows } from "@/lib/paginate.server";

/**
 * Metadata ingestion.
 *
 * This is the only write path into a workspace's usage. It takes the same
 * payload from a real customer's middleware and from the synthetic ecosystem's
 * ticker — the demo is not a special case wired around the front, it goes
 * through this endpoint like everyone else.
 *
 * Rollups are always re-derived from the raw events just written, never
 * incremented from the payload. A rollup that disagrees with its own events is
 * how a dashboard starts lying.
 */

export function adminClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Single source of truth for whether a workspace's writes must be flagged
 * synthetic. One query per call — never per row — mirroring the same lookup
 * savings.server.ts already does before writing switch_events. Callers
 * that already know the answer (see ingestEvents threading it into
 * rebuildRollups) pass it through instead of paying for it twice in one
 * request.
 */
async function lookupOrgIsSynthetic(
  db: ReturnType<typeof adminClient>,
  orgId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("organizations")
    .select("is_synthetic")
    .eq("id", orgId)
    .maybeSingle();
  if (error) throw new Error(`org synthetic lookup failed: ${error.message}`);
  return data?.is_synthetic ?? false;
}

export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

export interface AuthedKey {
  orgId: string;
  keyId: string;
}

/**
 * Resolve an API key to its workspace. Compared by hash, in constant time, and
 * a revoked key is treated exactly like an unknown one.
 */
export async function authenticateApiKey(rawKey: string): Promise<AuthedKey | null> {
  if (!rawKey || rawKey.length < 20) return null;
  const db = adminClient();
  const prefix = rawKey.slice(0, 8);
  const { data } = await db
    .from("api_keys")
    .select("id, org_id, key_hash, revoked_at")
    .eq("key_prefix", prefix)
    .is("revoked_at", null);

  const expected = hashApiKey(rawKey);
  for (const row of data ?? []) {
    const a = Buffer.from(row.key_hash);
    const b = Buffer.from(expected);
    if (a.length === b.length && timingSafeEqual(a, b)) {
      // Accepted risk (Dispatch 91): last_used_at is a convenience timestamp,
      // not an authorisation or billing input. A dropped stamp costs a stale
      // "last used" label and nothing else, and failing ingest over it would
      // trade a cosmetic loss for a real one.
      await db.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", row.id);
      return { orgId: row.org_id, keyId: row.id };
    }
  }
  return null;
}

export interface IngestResult {
  accepted: number;
  duplicates: number;
  bucketsRebuilt: number;
  /** Switches whose observed `saved_usd` was recomputed from this batch's traffic. */
  switchesRepriced: number;
}

export async function ingestEvents(orgId: string, events: IngestEvent[]): Promise<IngestResult> {
  const db = adminClient();
  const receivedAt = new Date().toISOString();
  const isSynthetic = await lookupOrgIsSynthetic(db, orgId);

  const rows = events.map((e) => ({
    org_id: orgId,
    is_synthetic: isSynthetic,
    occurred_at: e.occurred_at ?? receivedAt,
    model_key: e.model_key,
    host: e.host,
    task_hint: e.task_hint,
    /**
     * Dispatch 234. How much the label above is worth. Absent on a pre-234
     * container's payload, which means "not reported" and is stored as 0 —
     * the same value that container's traffic has always carried implicitly.
     * The coherence invariant (unknown iff zero) is enforced by the schema, so
     * nothing incoherent reaches this line.
     */
    task_confidence: e.task_confidence ?? 0,
    classifier_revision: e.classifier_revision,
    input_tokens: e.input_tokens,
    // Dispatch 204. Subsets of input_tokens, persisted so the row can be
    // repriced later against a corrected cache rate without re-reading an
    // envelope we deliberately do not keep.
    cache_read_tokens: e.cache_read_tokens,
    cache_write_tokens: e.cache_write_tokens,
    // A failed upstream call consumed the prompt and returned nothing; we do
    // not take the caller's word for it costing output tokens.
    output_tokens: e.status === "error" ? 0 : e.output_tokens,

    latency_ms: e.latency_ms ?? null,
    status: e.status,
    // Provenance of the counts above: read off the provider's envelope,
    // estimated by the connector, or unavailable. Validated at the edge since
    // Dispatch 99 but silently dropped here until Dispatch 102 — an estimate
    // that reaches the dashboard has to be able to say it is one.
    parse_status: e.parse_status,
    /**
     * Dispatch 106. A degraded read keeps a content-free skeleton of the
     * envelope so a parser shipped later can re-read it; a clean read keeps
     * nothing, because there is nothing left to learn about it.
     */
    envelope_skeleton:
      e.parse_status === "parsed" ? null : ((e.envelope_skeleton ?? null) as never),
    /**
     * Dispatch 155, Stage 6. The rerouting fields were validated at the edge
     * from Stage 4 and then dropped here, which meant the one piece of evidence
     * that a switch had actually moved traffic never reached storage — and
     * `saved_usd` could never be anything but asserted. Stored now, exactly as
     * reported: a model, a host and the id of the switch that matched.
     */
    rerouted: e.rerouted === true,
    original_model_key: e.rerouted ? (e.original_model_key ?? null) : null,
    original_host: e.rerouted ? (e.original_host ?? null) : null,
    route_reason: e.rerouted ? (e.route_reason ?? null) : null,
    fallback_reason: e.fallback_reason ?? null,
    idempotency_key: e.idempotency_key ?? null,
  }));


  const { data: inserted, error } = await db
    .from("usage_events")
    // eslint-disable-next-line costmyai/require-is-synthetic-on-guarded-insert -- is_synthetic is set per-row above (isSynthetic, from lookupOrgIsSynthetic) but the payload reaches this call as the rows identifier, not an inline object/array literal, so the rule can't verify it statically.
    .upsert(rows, { onConflict: "org_id,idempotency_key", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(`ingest failed: ${error.message}`);

  const accepted = inserted?.length ?? 0;
  const bucketsRebuilt = accepted > 0 ? await rebuildRollups(orgId, rows.map((r) => new Date(r.occurred_at)), isSynthetic) : 0;

  // Dispatch 104. An envelope the connector could not read is metered as zero
  // and looks, from the dashboard, exactly like traffic that did not happen.
  // It raises a report on the jobs board instead of passing silently.
  await watchUnparsedShapes(orgId, rows);

  /**
   * Dispatch 155, Stage 6. A batch that moved traffic updates the money the
   * switch has saved, in the same request that reported the traffic — so the
   * dashboard tile and the events behind it can never be more than one batch
   * apart. Recomputed from all of that switch's events, never incremented from
   * this batch, for the same reason rollups are re-derived rather than added to.
   */
  const touched = [...new Set(rows.filter((r) => r.rerouted && r.route_reason).map((r) => r.route_reason!))];
  let switchesRepriced = 0;
  if (accepted > 0 && touched.length > 0) {
    const { recomputeSwitchSavings } = await import("@/lib/switching/savings.server");
    switchesRepriced = (await recomputeSwitchSavings(db, orgId, touched)).length;
  }

  return { accepted, duplicates: rows.length - accepted, bucketsRebuilt, switchesRepriced };
}


/**
 * Raise one report per batch that carried an envelope the connector could not
 * read. Per batch, not per event: a customer running a genuinely new provider
 * would otherwise fill the ledger with the same finding thousands of times.
 *
 * The workspace is recorded with the finding. It is the answer to the first
 * question anyone asks of an alert ("whose traffic?"), and it is also what
 * lets the isolation sweep tell a real alert from one the integration suite
 * raised: an alert about a workspace that no longer exists is residue by
 * definition (Dispatch 112).
 */
async function watchUnparsedShapes(
  orgId: string,
  rows: Array<{ parse_status: string; model_key: string; host: string }>,
): Promise<void> {
  const unparsed = rows.filter((r) => r.parse_status === "unparsed");
  if (unparsed.length === 0) return;

  const pairs = [...new Set(unparsed.map((r) => `${r.model_key}@${r.host}`))].sort();
  const { reportUnrecognisedShape } = await import("@/lib/ops/shape-watch.server");
  await reportUnrecognisedShape({
    source: "ingest",
    count: unparsed.length,
    summary: `${unparsed.length} event${unparsed.length === 1 ? "" : "s"} arrived with an unreadable response envelope: ${pairs
      .slice(0, 5)
      .join(", ")}${pairs.length > 5 ? ` and ${pairs.length - 5} more` : ""}`,
    detail: { pairs, events: unparsed.length, orgId },
    orgId,
  });
}




/**
 * Re-derive every hour and day bucket the new events touched, straight from the
 * stored events. Same `rollupEvents` the seed and the tests use, so an
 * ingested hour and a seeded hour are computed by identical code.
 */
export async function rebuildRollups(
  orgId: string,
  timestamps: Date[],
  orgIsSynthetic?: boolean,
): Promise<number> {
  const db = adminClient();
  const isSynthetic = orgIsSynthetic ?? (await lookupOrgIsSynthetic(db, orgId));
  const min = new Date(Math.min(...timestamps.map((t) => t.getTime())));
  const max = new Date(Math.max(...timestamps.map((t) => t.getTime())));
  const from = bucketStart(min, "day");
  const to = new Date(bucketStart(max, "day").getTime() + DAY_MS);

  // Paged: a rollup rebuilt from a truncated page would under-report the day's
  // real spend, and the truncation is silent.
  const raw = await fetchAllRows(
    (f, t) =>
      db
        .from("usage_events")
        .select(
          "occurred_at, model_key, host, task_hint, task_confidence, classifier_revision, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, latency_ms, status",
        )
        .eq("org_id", orgId)
        .gte("occurred_at", from.toISOString())
        .lt("occurred_at", to.toISOString())
        .order("occurred_at", { ascending: true })
        .range(f, t),
    { maxPages: 500 },
  );

  const priceRows = await fetchAllRows((from_, to_) =>
    db
      .from("host_prices")
      .select(
        "model_key, host, host_label, input_usd_per_mtok, output_usd_per_mtok, cache_read_usd_per_mtok, cache_write_usd_per_mtok, supports_prompt_caching",
      )

      .eq("is_fixture", false)
      .range(from_, to_),
  );
  const priceIndex = new Map(priceRows.map((p) => [`${p.model_key}|${p.host}`, p as PriceRow]));
  const priceFor = (modelKey: string, host: string) => priceIndex.get(`${modelKey}|${host}`);

  /**
   * Real gateways report provider-native model names. Resolve them to catalog
   * keys before rolling up, or a customer's traffic is priced at nothing and
   * shown as nothing. Whatever still does not resolve keeps its own name and is
   * rolled up unpriced — visible, and honestly marked as having no pricing.
   */
  const [catalog, aliases] = await Promise.all([
    fetchAllRows((f, t) => db.from("model_catalog").select("model_key").eq("is_active", true).range(f, t)),
    fetchAllRows((f, t) => db.from("model_aliases").select("alias, model_key").range(f, t)),
  ]);
  const resolveModel = buildModelResolver(
    catalog.map((c) => c.model_key),
    aliases,
  );

  /**
   * Dispatch 96 — the same treatment for hosts. A gateway that reports
   * `api.openai.com` is talking about the host we price as `openai`; an
   * ambiguous or unknown hostname keeps its own name and stays unpriced
   * rather than being attributed to a provider on a guess.
   */
  const resolveHost = buildHostResolver(
    priceRows.map((p) => p.host),
    { pricedPairs: new Set(priceIndex.keys()) },
  );

  const events: SyntheticEvent[] = (raw ?? []).map((r) => {
    const modelKey = resolveModel(r.model_key).key;
    return {
      occurredAt: new Date(r.occurred_at),
      modelKey,
      host: resolveHost(r.host, modelKey).key,
      taskHint: r.task_hint,
      // Dispatch 234. Carried into the rollup as metadata only — see rollupEvents.
      taskConfidence: Number(r.task_confidence ?? 0),
      classifierRevision: r.classifier_revision ?? 0,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      cacheReadTokens: r.cache_read_tokens ?? 0,
      cacheWriteTokens: r.cache_write_tokens ?? 0,

      latencyMs: r.latency_ms ?? 0,
      status: r.status === "error" ? "error" : "ok",
    };
  });

  const buckets = [...rollupEvents(events, "hour", priceFor), ...rollupEvents(events, "day", priceFor)];

  /**
   * Unpriced traffic is recorded but never given a fabricated cost. It used to
   * be dropped here, which turned "we cannot price this" into "you sent us
   * nothing" — the customer saw an empty dashboard with no explanation. The
   * bucket is written with cost 0 and surfaces through the existing coverage
   * disclosure ("N models excluded from the spend total").
   */
  const payload = buckets
    .map((b) => ({
      org_id: orgId,
      is_synthetic: isSynthetic,
      bucket_start: b.bucketStart.toISOString(),
      granularity: b.granularity,
      model_key: b.modelKey,
      host: b.host,
      task_hint: b.taskHint,
      requests: b.requests,
      input_tokens: b.inputTokens,
      output_tokens: b.outputTokens,
      cache_read_tokens: b.cacheReadTokens,
      cache_write_tokens: b.cacheWriteTokens,
      cost_usd: b.costUsd,
      output_p50: b.outputP50,
      output_p95: b.outputP95,
      peak_total_tokens: b.peakTotalTokens,
      /**
       * Dispatch 234. Metadata beside the bucket, deliberately NOT part of the
       * grouping key: folding confidence into the key would split one workload
       * into a row per distinct confidence value and shatter every cohort that
       * reads this table.
       */
      task_confidence_mean: b.taskConfidenceMean,
      classifier_revision_min: b.classifierRevisionMin,

    }));

  /**
   * Dispatch 121. A rebuild is authoritative for the window it covers. When
   * resolution improves, yesterday's rows were written under the raw provider
   * name and today's under the catalog key — upserting alone would leave both
   * and double the customer's tokens and requests. Clear the window first.
   */
  const { error: clearError } = await db
    .from("usage_rollups")
    .delete()
    .eq("org_id", orgId)
    .gte("bucket_start", from.toISOString())
    .lt("bucket_start", to.toISOString());
  if (clearError) throw new Error(`rollup clear failed: ${clearError.message}`);

  for (let i = 0; i < payload.length; i += 500) {

    const { error: upsertError } = await db
      .from("usage_rollups")
      // eslint-disable-next-line costmyai/require-is-synthetic-on-guarded-insert -- is_synthetic is set per-row above (isSynthetic, from lookupOrgIsSynthetic/orgIsSynthetic) but the payload reaches this call as a slice() expression, not an inline object/array literal, so the rule can't verify it statically.
      .upsert(payload.slice(i, i + 500), {
        onConflict: "org_id,bucket_start,granularity,model_key,host,task_hint",
      });
    if (upsertError) throw new Error(`rollup upsert failed: ${upsertError.message}`);
  }

  return payload.length;
}

/** Cost of a single priced event, for callers that want to preview a batch. */
export function previewCost(price: PriceRow, e: IngestEvent): number {
  return costOf(price, e.input_tokens, e.status === "error" ? 0 : e.output_tokens, {
    readTokens: e.cache_read_tokens,
    writeTokens: e.cache_write_tokens,
  });
}

