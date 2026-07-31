/**
 * Apply the synthetic ecosystem to the demo workspace through the Data API,
 * for environments where no privileged psql session is available.
 *
 *   bun run scripts/apply-synthetic.ts
 *
 * Clears the demo workspace first (insert-only seeding: a row is never
 * rewritten underneath a decision already made on it), then writes the same
 * rows scripts/seed-synthetic.ts would emit as SQL.
 */
import { createClient } from "@supabase/supabase-js";

import { buildSynthetic, ORG_ID, SEED } from "./build-synthetic";

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const built = buildSynthetic();
console.error(JSON.stringify(built.stats, null, 2));

async function wipe() {
  for (const table of [
    "billing_reconciliations",
    "billing_captures",
    "workload_profiles",
    "usage_rollups",
    "usage_events",
  ]) {
    const { error } = await db.from(table).delete().eq("org_id", ORG_ID);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

async function insertAll(table: string, rows: any[], chunk = 2000) {
  for (let i = 0; i < rows.length; i += chunk) {
    const { error } = await db.from(table).insert(rows.slice(i, i + chunk));
    if (error) throw new Error(`${table} @${i}: ${error.message}`);
    if (i % 50_000 === 0) console.error(`  ${table}: ${i}/${rows.length}`);
  }
  console.error(`  ${table}: ${rows.length}/${rows.length}`);
}

await wipe();

await insertAll(
  "usage_events",
  built.rawEvents.map((e, i) => ({
    org_id: ORG_ID,
    occurred_at: e.occurredAt.toISOString(),
    model_key: e.modelKey,
    host: e.host,
    task_hint: e.taskHint,
    input_tokens: e.inputTokens,
    output_tokens: e.outputTokens,
    latency_ms: e.latencyMs,
    status: e.status,
    idempotency_key: `${SEED}:${e.occurredAt.getTime()}:${i}`,
  })),
);

await insertAll(
  "usage_rollups",
  [...built.dailyRollups, ...built.hourlyRollups].map((r) => ({
    org_id: ORG_ID,
    bucket_start: r.bucketStart.toISOString(),
    granularity: r.granularity,
    model_key: r.modelKey,
    host: r.host,
    task_hint: r.taskHint,
    requests: r.requests,
    input_tokens: r.inputTokens,
    output_tokens: r.outputTokens,
    cost_usd: r.costUsd,
    output_p50: r.outputP50,
    output_p95: r.outputP95,
  })),
);

await insertAll(
  "workload_profiles",
  built.profiles.map((p) => ({
    org_id: ORG_ID,
    model_key: p.modelKey,
    host: p.host,
    task_hint: p.taskHint,
    avg_input_tokens: p.avgInputTokens,
    avg_output_tokens: p.avgOutputTokens,
    complexity_score: p.complexityScore,
    required_tier: p.requiredTier,
    observed_tier: p.observedTier,
    monthly_cost_usd: p.monthlyCostUsd,
    computed_at: built.to.toISOString(),
  })),
);

for (const b of built.billing) {
  const { data, error } = await db
    .from("billing_captures")
    .insert({
      org_id: ORG_ID,
      provider: b.provider,
      period_start: b.periodStart,
      period_end: b.periodEnd,
      invoiced_usd: b.invoicedUsd,
      currency: "USD",
      idempotency_key: b.idempotencyKey,
      captured_at: built.to.toISOString(),
    })
    .select("id")
    .single();
  if (error) throw new Error(`billing_captures ${b.provider}: ${error.message}`);
  const { error: recErr } = await db.from("billing_reconciliations").insert({
    org_id: ORG_ID,
    capture_id: data!.id,
    estimated_usd: b.estimatedUsd,
    invoiced_usd: b.invoicedUsd,
    delta_usd: b.deltaUsd,
    delta_pct: b.deltaPct,
    verdict: b.verdict,
    note: b.note,
    computed_at: built.to.toISOString(),
  });
  if (recErr) throw new Error(`billing_reconciliations ${b.provider}: ${recErr.message}`);
}

console.error("applied");
