/**
 * Emit the synthetic ecosystem as SQL for a privileged psql session.
 *
 *   bun run scripts/seed-synthetic.ts > /tmp/synthetic.sql
 *
 * Rows are built by scripts/build-synthetic.ts, the single source of truth
 * shared with scripts/apply-synthetic.ts, so the two writers can never drift.
 */
import { buildSynthetic, ORG_ID, SEED } from "./build-synthetic";
import type { RollupRow } from "../src/lib/synthetic/generator";

const built = buildSynthetic();
const { rawEvents, dailyRollups, hourlyRollups, profiles, billing, to } = built;

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
const ts = (d: Date) => lit(d.toISOString());
const out: string[] = [];

out.push("begin;");

// Raw metadata events — no prompt content, by construction.
out.push(
  `insert into public.usage_events (org_id, occurred_at, model_key, host, task_hint, input_tokens, output_tokens, latency_ms, status, idempotency_key, is_synthetic) values`,
);
out.push(
  rawEvents
    .map(
      (e, i) =>
        `(${lit(ORG_ID)}, ${ts(e.occurredAt)}, ${lit(e.modelKey)}, ${lit(e.host)}, ${lit(e.taskHint)}, ${e.inputTokens}, ${e.outputTokens}, ${e.latencyMs}, ${lit(e.status)}, ${lit(`${SEED}:${e.occurredAt.getTime()}:${i}`)}, true)`,
    )
    .join(",\n"),
);
out.push("on conflict (org_id, idempotency_key) do nothing;");

const rollupValues = (rows: RollupRow[]) =>
  rows
    .map(
      (r) =>
        `(${lit(ORG_ID)}, ${ts(r.bucketStart)}, ${lit(r.granularity)}, ${lit(r.modelKey)}, ${lit(r.host)}, ${lit(r.taskHint)}, ${r.requests}, ${r.inputTokens}, ${r.outputTokens}, ${r.costUsd.toFixed(6)}, ${r.outputP50}, ${r.outputP95}, true)`,
    )
    .join(",\n");

out.push(
  `insert into public.usage_rollups (org_id, bucket_start, granularity, model_key, host, task_hint, requests, input_tokens, output_tokens, cost_usd, output_p50, output_p95, is_synthetic) values`,
);
out.push(rollupValues([...dailyRollups, ...hourlyRollups]));
// Insert-only: a reseed clears the workspace first (see scripts/README-synthetic.md),
// so an existing row is never silently rewritten underneath a decision already made on it.
out.push(`on conflict (org_id, bucket_start, granularity, model_key, host, task_hint) do nothing;`);

out.push(
  `insert into public.workload_profiles (org_id, model_key, host, task_hint, avg_input_tokens, avg_output_tokens, complexity_score, required_tier, observed_tier, monthly_cost_usd, computed_at, is_synthetic) values`,
);
out.push(
  profiles
    .map(
      (p) =>
        `(${lit(ORG_ID)}, ${lit(p.modelKey)}, ${lit(p.host)}, ${lit(p.taskHint)}, ${p.avgInputTokens}, ${p.avgOutputTokens}, ${p.complexityScore}, ${lit(p.requiredTier)}, ${lit(p.observedTier)}, ${p.monthlyCostUsd}, ${ts(to)}, true)`,
    )
    .join(",\n"),
);
out.push(`on conflict (org_id, model_key, host, task_hint) do nothing;`);

for (const b of billing) {
  out.push(
    `with cap as (
  insert into public.billing_captures (org_id, provider, period_start, period_end, invoiced_usd, currency, idempotency_key, is_synthetic, captured_at)
  values (${lit(ORG_ID)}, ${lit(b.provider)}, ${lit(b.periodStart)}, ${lit(b.periodEnd)}, ${b.invoicedUsd}, 'USD', ${lit(b.idempotencyKey)}, true, ${ts(to)})
  on conflict (org_id, provider, period_start, period_end) do nothing
  returning id
)
insert into public.billing_reconciliations (org_id, capture_id, estimated_usd, invoiced_usd, delta_usd, delta_pct, verdict, note, computed_at)
select ${lit(ORG_ID)}, cap.id, ${b.estimatedUsd}, ${b.invoicedUsd}, ${b.deltaUsd}, ${b.deltaPct}, ${lit(b.verdict)}, ${lit(b.note)}, ${ts(to)} from cap;`,
  );
}

out.push("commit;");
console.log(out.join("\n"));
console.error(JSON.stringify(built.stats, null, 2));
