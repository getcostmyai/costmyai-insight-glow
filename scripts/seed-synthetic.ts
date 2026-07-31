/**
 * Materialise the synthetic ecosystem into the demo workspace.
 *
 *   bun run scripts/seed-synthetic.ts > /tmp/synthetic.sql
 *
 * Deterministic: same seed and same window produce identical SQL. Raw metadata
 * events are written for the most recent RAW_EVENT_HOURS so the ingestion path
 * is demonstrable end to end; rollups for the full window are aggregated from
 * the very same generated events, so the two can never disagree.
 */
import { execFileSync } from "node:child_process";

import type { ModelRow, PriceRow } from "../src/lib/engine/types";
import {
  DAY_MS,
  generateEvents,
  HOUR_MS,
  rollupEvents,
  type RollupRow,
  type SyntheticEvent,
} from "../src/lib/synthetic/generator";
import { aggregateRollups, buildBilling, buildProfiles } from "../src/lib/synthetic/profiles";
import { sizeWorkloads } from "../src/lib/synthetic/sizing";
import { SYNTHETIC_WORKLOADS } from "../src/lib/synthetic/workloads";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const WINDOW_DAYS = 30;
const RAW_EVENT_HOURS = 48;
const SEED = process.env.SYNTHETIC_SEED ?? "costmyai-demo-v1";

function q(sql: string): any[] {
  const out = execFileSync("psql", ["-At", "-c", `select coalesce(json_agg(t),'[]') from (${sql}) t`], {
    encoding: "utf8",
  });
  return JSON.parse(out.trim());
}

const prices: PriceRow[] = q(
  "select model_key, host, host_label, input_usd_per_mtok::float8, output_usd_per_mtok::float8 from host_prices",
);
const models: ModelRow[] = q("select model_key, display_name, vendor, tier from model_catalog");

const priceIndex = new Map(prices.map((p) => [`${p.model_key}|${p.host}`, p]));
const priceFor = (modelKey: string, host: string) => priceIndex.get(`${modelKey}|${host}`);

const now = new Date();
now.setUTCMinutes(0, 0, 0);
const to = new Date(now.getTime() + HOUR_MS);
const from = new Date(to.getTime() - WINDOW_DAYS * DAY_MS);
const rawFrom = new Date(to.getTime() - RAW_EVENT_HOURS * HOUR_MS);

// Request rates are solved per model against the live synced price, not chosen
// by hand and not scaled flat: an expensive model needs a couple of dozen calls
// a day to carry its share of the bill, a cheap one needs tens of thousands.
const sized = sizeWorkloads(SYNTHETIC_WORKLOADS, priceFor);

const allEvents: SyntheticEvent[] = [];
for (const workload of sized) {
  allEvents.push(
    ...generateEvents({ workload, from, to, windowStart: from, windowEnd: to, seed: SEED }),
  );
}
allEvents.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

const rawEvents = allEvents.filter((e) => e.occurredAt >= rawFrom);
const dailyRollups = rollupEvents(allEvents, "day", priceFor);
const hourlyRollups = rollupEvents(rawEvents, "hour", priceFor);

const usage = aggregateRollups(dailyRollups, WINDOW_DAYS);
const profiles = buildProfiles(usage, models, priceFor);
const billing = buildBilling(dailyRollups, from, to, {
  // Real invoices drift from metadata estimates for real reasons.
  openai: -0.031, // prompt caching on the answer composer
  anthropic: 0.008, // rounding only
  alibaba: 0.024, // minimum billing units on short code calls
  deepinfra: -0.006,
  venice: 0.011,
  groq: 0.041, // untracked retries counted by the provider
});

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

const totalCost = dailyRollups.reduce((s, r) => s + r.costUsd, 0);
console.error(
  JSON.stringify(
    {
      seed: SEED,
      window: [from.toISOString(), to.toISOString()],
      events_generated: allEvents.length,
      raw_events_written: rawEvents.length,
      daily_rollups: dailyRollups.length,
      hourly_rollups: hourlyRollups.length,
      profiles: profiles.length,
      billing_pairs: billing.length,
      monthly_spend_usd: Math.round(totalCost * 100) / 100,
      requests_per_day_by_model: Object.fromEntries(
        sized.map((w) => [`${w.modelKey}@${w.host}`, w.requestsPerDay]),
      ),
    },
    null,
    2,
  ),
);
