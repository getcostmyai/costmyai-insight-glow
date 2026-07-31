import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import type { PriceRow } from "@/lib/engine/types";

import { DAY_MS, generateEvents, type SyntheticEvent } from "./generator";
import { sizeWorkloads } from "./sizing";
import { SYNTHETIC_WORKLOADS } from "./workloads";

/** Never generate more than this in one tick, however long the gap was. */
const MAX_CATCHUP_MS = 15 * 60 * 1000;
/** The ecosystem's rolling history window — the same one the seed materialised. */
const WINDOW_DAYS = 30;
const SEED = process.env.SYNTHETIC_SEED ?? "costmyai-demo-v1";
const BATCH = 500;

export interface TickReport {
  orgId: string;
  from: string;
  to: string;
  generated: number;
  accepted: number;
  duplicates: number;
  bucketsRebuilt: number;
}

function adminClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Generate the traffic the synthetic ecosystem produced since it was last seen,
 * and push it through the public ingest endpoint exactly as customer middleware
 * would. Returns what ingest reported, not what we hoped it would do.
 */
export async function runSyntheticTick(origin: string): Promise<TickReport> {
  const ingestKey = process.env.SYNTHETIC_INGEST_KEY;
  if (!ingestKey) throw new Error("SYNTHETIC_INGEST_KEY is not configured");

  const db = adminClient();

  const { data: org, error: orgError } = await db
    .from("organizations")
    .select("id")
    .eq("is_synthetic", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (orgError) throw new Error(orgError.message);
  if (!org) throw new Error("No synthetic workspace exists — seed it before ticking.");

  const now = new Date();
  const { data: last } = await db
    .from("usage_events")
    .select("occurred_at")
    .eq("org_id", org.id)
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastAt = last ? new Date(last.occurred_at) : new Date(now.getTime() - 60_000);
  const from = new Date(Math.max(lastAt.getTime() + 1, now.getTime() - MAX_CATCHUP_MS));
  if (from >= now) {
    return {
      orgId: org.id,
      from: from.toISOString(),
      to: now.toISOString(),
      generated: 0,
      accepted: 0,
      duplicates: 0,
      bucketsRebuilt: 0,
    };
  }

  const { data: priceRows, error: priceError } = await db
    .from("host_prices")
    .select("model_key, host, host_label, input_usd_per_mtok, output_usd_per_mtok")
    .eq("is_fixture", false);
  if (priceError) throw new Error(priceError.message);
  const priceIndex = new Map((priceRows ?? []).map((p) => [`${p.model_key}|${p.host}`, p as PriceRow]));
  const priceFor = (modelKey: string, host: string) => priceIndex.get(`${modelKey}|${host}`);

  // Volume is solved against the same live prices the dashboard bills with, so
  // a price change moves the demo's request rate the way it would move a real
  // customer's bill.
  const sized = sizeWorkloads(SYNTHETIC_WORKLOADS, priceFor);
  const windowStart = new Date(now.getTime() - WINDOW_DAYS * DAY_MS);

  const events: SyntheticEvent[] = [];
  for (const workload of sized) {
    events.push(
      ...generateEvents({ workload, from, to: now, windowStart, windowEnd: now, seed: SEED }),
    );
  }
  events.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  const payload = events.map((e, i) => ({
    occurred_at: e.occurredAt.toISOString(),
    model_key: e.modelKey,
    host: e.host,
    task_hint: e.taskHint as "generation" | "code" | "classification",
    input_tokens: e.inputTokens,
    output_tokens: e.outputTokens,
    latency_ms: e.latencyMs,
    status: e.status,
    // Deterministic per slice: a retried tick regenerates the same keys and
    // ingest drops them instead of inflating the demo.
    idempotency_key: `${SEED}:${e.modelKey}:${e.host}:${e.taskHint}:${e.occurredAt.getTime()}:${i}`,
  }));

  let accepted = 0;
  let duplicates = 0;
  let bucketsRebuilt = 0;

  for (let i = 0; i < payload.length; i += BATCH) {
    const res = await fetch(`${origin}/api/public/v1/events`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${ingestKey}` },
      body: JSON.stringify({ v: 1, events: payload.slice(i, i + BATCH) }),
    });
    if (!res.ok) {
      throw new Error(`ingest rejected the tick [${res.status}]: ${await res.text()}`);
    }
    const result = (await res.json()) as { accepted: number; duplicates: number; bucketsRebuilt: number };
    accepted += result.accepted;
    duplicates += result.duplicates;
    bucketsRebuilt += result.bucketsRebuilt;
  }

  return {
    orgId: org.id,
    from: from.toISOString(),
    to: now.toISOString(),
    generated: payload.length,
    accepted,
    duplicates,
    bucketsRebuilt,
  };
}
