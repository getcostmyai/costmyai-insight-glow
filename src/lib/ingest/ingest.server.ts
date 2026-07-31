import { createClient } from "@supabase/supabase-js";
import { createHash, timingSafeEqual } from "crypto";

import type { Database } from "@/integrations/supabase/types";
import { costOf } from "@/lib/engine/cost";
import type { PriceRow } from "@/lib/engine/types";
import { bucketStart, DAY_MS, rollupEvents, type SyntheticEvent } from "@/lib/synthetic/generator";

import type { IngestEvent } from "./schema";

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

function adminClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
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
}

export async function ingestEvents(orgId: string, events: IngestEvent[]): Promise<IngestResult> {
  const db = adminClient();
  const receivedAt = new Date().toISOString();

  const rows = events.map((e) => ({
    org_id: orgId,
    occurred_at: e.occurred_at ?? receivedAt,
    model_key: e.model_key,
    host: e.host,
    task_hint: e.task_hint,
    input_tokens: e.input_tokens,
    // A failed upstream call consumed the prompt and returned nothing; we do
    // not take the caller's word for it costing output tokens.
    output_tokens: e.status === "error" ? 0 : e.output_tokens,
    latency_ms: e.latency_ms ?? null,
    status: e.status,
    idempotency_key: e.idempotency_key ?? null,
  }));

  const { data: inserted, error } = await db
    .from("usage_events")
    .upsert(rows, { onConflict: "org_id,idempotency_key", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(`ingest failed: ${error.message}`);

  const accepted = inserted?.length ?? 0;
  const bucketsRebuilt = accepted > 0 ? await rebuildRollups(orgId, rows.map((r) => new Date(r.occurred_at))) : 0;

  return { accepted, duplicates: rows.length - accepted, bucketsRebuilt };
}

/**
 * Re-derive every hour and day bucket the new events touched, straight from the
 * stored events. Same `rollupEvents` the seed and the tests use, so an
 * ingested hour and a seeded hour are computed by identical code.
 */
async function rebuildRollups(orgId: string, timestamps: Date[]): Promise<number> {
  const db = adminClient();
  const min = new Date(Math.min(...timestamps.map((t) => t.getTime())));
  const max = new Date(Math.max(...timestamps.map((t) => t.getTime())));
  const from = bucketStart(min, "day");
  const to = new Date(bucketStart(max, "day").getTime() + DAY_MS);

  const { data: raw, error } = await db
    .from("usage_events")
    .select("occurred_at, model_key, host, task_hint, input_tokens, output_tokens, latency_ms, status")
    .eq("org_id", orgId)
    .gte("occurred_at", from.toISOString())
    .lt("occurred_at", to.toISOString())
    .order("occurred_at", { ascending: true })
    .limit(200_000);
  if (error) throw new Error(`rollup rebuild failed: ${error.message}`);

  const { data: priceRows } = await db
    .from("host_prices")
    .select("model_key, host, host_label, input_usd_per_mtok, output_usd_per_mtok")
    .eq("is_fixture", false);
  const priceIndex = new Map((priceRows ?? []).map((p) => [`${p.model_key}|${p.host}`, p as PriceRow]));
  const priceFor = (modelKey: string, host: string) => priceIndex.get(`${modelKey}|${host}`);

  const events: SyntheticEvent[] = (raw ?? []).map((r) => ({
    occurredAt: new Date(r.occurred_at),
    modelKey: r.model_key,
    host: r.host,
    taskHint: r.task_hint,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    latencyMs: r.latency_ms ?? 0,
    status: r.status === "error" ? "error" : "ok",
  }));

  const buckets = [...rollupEvents(events, "hour", priceFor), ...rollupEvents(events, "day", priceFor)];

  // Unpriced traffic is recorded but never given a fabricated cost.
  const payload = buckets
    .filter((b) => priceFor(b.modelKey, b.host))
    .map((b) => ({
      org_id: orgId,
      bucket_start: b.bucketStart.toISOString(),
      granularity: b.granularity,
      model_key: b.modelKey,
      host: b.host,
      task_hint: b.taskHint,
      requests: b.requests,
      input_tokens: b.inputTokens,
      output_tokens: b.outputTokens,
      cost_usd: b.costUsd,
      output_p50: b.outputP50,
      output_p95: b.outputP95,
    }));

  for (let i = 0; i < payload.length; i += 500) {
    const { error: upsertError } = await db
      .from("usage_rollups")
      .upsert(payload.slice(i, i + 500), {
        onConflict: "org_id,bucket_start,granularity,model_key,host,task_hint",
      });
    if (upsertError) throw new Error(`rollup upsert failed: ${upsertError.message}`);
  }

  return payload.length;
}

/** Cost of a single priced event, for callers that want to preview a batch. */
export function previewCost(price: PriceRow, e: IngestEvent): number {
  return costOf(price, e.input_tokens, e.status === "error" ? 0 : e.output_tokens);
}
