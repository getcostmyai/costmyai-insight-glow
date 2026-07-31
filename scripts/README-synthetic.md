# Synthetic ecosystem

The demo workspace (`Demo Workspace`, slug `demo`) runs on generated data. Every
row is written with `is_synthetic = true`, and the database trigger
`enforce_synthetic_flag` stamps that flag from the owning organization, so a
synthetic row can never end up attached to a real workspace.

## What is generated

| Table | Contents |
| --- | --- |
| `usage_events` | Raw metadata records for the most recent 30 hours (always covering the whole current UTC day) — exactly what the middleware pushes: model, host, task hint, token counts, latency, status. No prompt content, because none is ever collected. |
| `usage_rollups` | Daily buckets for 30 days plus hourly buckets for the last 30 hours, including `output_p50` / `output_p95`. |
| `workload_profiles` | Per-workload averages, complexity score, observed tier vs required tier, monthly cost. |
| `billing_captures` / `billing_reconciliations` | Provider invoices versus the metadata estimate, with a verdict per provider. |

## Invariants

- **Deterministic.** Same `SYNTHETIC_SEED` and same window produce identical
  output. A demo that reshuffles on every reseed cannot be audited.
- **Rollups are derived, never asserted.** Both granularities are aggregated
  from the same generated events through `rollupEvents`, and priced through the
  engine's single `costOf`. The raw-event overlap is checkable in SQL: hourly
  rollups equal the aggregation of the raw events, row for row.
- **Insert-only.** The seeder never rewrites an existing row underneath a
  decision that was already made on it. Reseeding clears the workspace first.

## Reseeding

```bash
bun run scripts/seed-synthetic.ts > /tmp/synthetic.sql   # stats go to stderr
```

Then clear the demo workspace (`billing_reconciliations`, `billing_captures`,
`workload_profiles`, `usage_rollups`, `usage_events` for the demo org) and apply
the file:

```bash
psql -v ON_ERROR_STOP=1 -f /tmp/synthetic.sql
```

Where no privileged psql session exists, use the Data API applier instead — it
builds the identical rows from `scripts/build-synthetic.ts`, wipes the demo
workspace and writes them with the service role:

```bash
bun run scripts/apply-synthetic.ts
```

## The 30-day retrospective is seeded, not accumulated

The historical seed materialises the full 30-day window at apply time, so the
demo shows a real month of history the moment anyone opens it. The live tick
only extends the curve forward from now; it is never the source of the trend.

## Verifying rollups against raw events

```sql
with agg as (
  select date_trunc('hour', occurred_at) b, model_key, host, task_hint,
         count(*) r, sum(input_tokens) i, sum(output_tokens) o
  from usage_events group by 1,2,3,4
)
select count(*) filter (
         where u.requests = a.r and u.input_tokens = a.i and u.output_tokens = a.o
       ) as matching, count(*) as total
from usage_rollups u
join agg a on a.b = u.bucket_start and a.model_key = u.model_key
          and a.host = u.host and a.task_hint = u.task_hint
where u.granularity = 'hour';
```
