# Dispatch 160 — Audit findings and fix plan

## What was measured

### 1. The rows behind the "Allow routing to X" cards

```sql
select id, org_id, from_model, from_host, to_model, to_host, status, saved_usd, is_synthetic, activated_at
from switches order by activated_at desc;
```

Real output (extract, both demo orgs `...0001` Demo Workspace and `...0002` Partner Demo Workspace):

```text
id                                    from_host      to_host    status  saved_usd  is_synthetic  activated_at
6e2bbbbe-2029-4101-9d12-c47321f70fdd  azure          google     active       0.00  t             2026-08-04
e813c3f0-4979-4df9-b7a4-c38a2eea4645  anthropic      deepinfra  active      35.07  t             2026-08-03
17d5bba2-6b58-4cce-802c-aca9737b55ae  azure          openai     active      12.12  t             2026-08-01
408fdec5-75aa-4cfe-af5c-619e9040d882  venice         baidu      active      18.17  t             2026-07-30
5be85486-7ccd-4248-bf2a-ecd1000a0702  groq           deepinfra  active      37.14  t             2026-07-28
2c1e9ad1-887f-4171-9cc3-27f3b7a7e215  groq           coreweave  active     102.10  t             2026-07-26
dbc987e6-37bb-4822-be1b-62ca3d26783e  alibaba        ionstream  active     239.10  t             2026-07-24
350216fc-f5a9-4257-818e-0c5ec0f42dfa  azure          openai     active     294.73  t             2026-07-22
690037d7-0298-41e3-8143-8fe7edad49c0  azure          openai     active     568.36  t             2026-07-18
6fc70ad6-cc59-409c-a46d-bfba20e2bfdf  api.openai.com azure      active     461.28  t             2026-07-13
(25 rows total; every row is_synthetic = t)
```

`saved_usd` is **nonzero** for switches whose card renders "Allow routing to OpenAI" / "Connect IonStream first". Screenshot of `/demo/rightsize`: card `openai/gpt-5.5 -> openai` shows `CAPTURED TO DATE +$568.36` with the subtitle `ALLOW ROUTING TO OPENAI`; `qwen3-coder-next -> ionstream` shows `+$187.44` under `CONNECT IONSTREAM FIRST`.

### 2. Gate state that produces those labels

```sql
select org_id, host, granted, revoked_at from org_provider_routing;
-- (0 rows)
```

No routing grant exists anywhere, so `decideExecutable` returns `executable: false` for every cross-host switch in the system. The labels are correct. The money is not.

### 3. Which code path wrote the nonzero figures

Not the runtime path.

```sql
select org_id, count(*) filter (where rerouted) as rerouted, count(*) as total from usage_events group by 1;
-- ...0001 | 0 | 1287380
-- ...0002 | 0 |  210812
-- 5e7ad1de (Robin, real) | 0 | 6

select org_id, route_reason, count(*) from usage_events where rerouted group by 1,2;
-- (0 rows)
```

Zero rerouted events exist, so `recomputeSwitchSavings` (`src/lib/switching/savings.server.ts:205`) has never written any of these values — it only sums `usage_events` where `rerouted = true and status = 'ok'` (`savings.server.ts:87-91`) and is only invoked from `src/lib/ingest/ingest.server.ts:145-149`.

The two writers are seed migrations:

- `supabase/migrations/20260804214025_...sql:19` — `saved_usd = round(staged.monthly / 30.0 * staged.days_ago * 0.9, 2)`, i.e. the recommendation's projected monthly saving pro-rated by age, applied to `is_synthetic` rows.
- `supabase/migrations/20260809143051_...sql:1-2` — inserts a switch with a literal `41.80`.

Neither consults gate state, because neither is a runtime path. **This is not a gate bypass in the customer path.**

### 4. Cross-check against the real workspace

Robin's `Robinpetermueller's workspace` (`5e7ad1de-...`, plan `certify`) has **0 rows in `switches`** and 0 rerouted events, so no real customer figure is affected today. The only writer that can ever produce a nonzero `saved_usd` for a real workspace is `recomputeSwitchSavings`, fed exclusively by container-reported `rerouted` events.

### Residual, worth closing while we are here

Ingest trusts the container's `route_reason` without re-checking the switch's own gate server-side (`src/lib/ingest/ingest.server.ts:115-118`, then `:145`). A container that reported `rerouted: true` naming a switch that is not executable today would accrue `saved_usd` against an "Allow routing" card. It cannot happen with our container, but the server should not depend on that.

### 5. Section-title accuracy (standalone violation)

`src/components/dashboard/levels/RightsizeLevel.tsx:461-462` renders eyebrow `Working for you right now` / title `Active switches` over a list that, as the screenshot shows, currently contains 13 cards of which none are executing. Two of the four execution tones in that one list assert the opposite of the header. This breaks the LIVE-is-absolute rule independently of the money bug.

## The fix

1. **Fixture honesty (root cause of the number).** New migration that zeroes `saved_usd` for every `is_synthetic` switch whose destination host has no `granted` row in `org_provider_routing` — i.e. every synthetic switch that is not Phase 1 same-host executable. Same-host synthetic switches keep a seeded figure, because those genuinely would be rerouting. Remove the pro-rating formula from the seeding path (`scripts/apply-synthetic.ts` / future seeds) so it cannot be reintroduced: seeds may only write `saved_usd` for rows they also back with rerouted `usage_events`.

2. **Server-side gate at accrual time.** In `recomputeSwitchSavings`, resolve the switch's gate through the same `decideExecutable` used by the plan builder and refuse to credit a switch that is not executable, recording the refusal rather than silently dropping it. This makes the invariant "a card that says Allow routing cannot show captured dollars" enforced at the write, not at render.

3. **Render-side invariant (defence in depth).** In `dashboard.server.ts` `toSwitchRow`, when `execution.tone` is not `automatic`, `saved`/`monthlyRate` must be 0 and the card renders "No traffic moved yet" in place of `CAPTURED TO DATE`. A number and a "not executing" label can never appear on the same card again.

4. **Split the section by real execution state.** Replace the single "Active switches / Working for you right now" block with two:
   - `Rerouting now` — only `tone === "automatic"` rows. Keeps run-rate and captured figures.
   - `Activated, waiting on you` — `connect_first`, `allow_routing`, `confirm_once`, `not_available` rows, headed with copy that states nothing is moving yet, showing the opportunity value rather than a captured figure.
   Same treatment in `GovernLevel.tsx`, which reuses `data.activeSwitches`. Counters that say "switches already running" (`RightsizeLevel.tsx:173`, `GovernLevel.tsx:107`) count only the executing set.

5. **Standing check.** Add an audit assertion (`scripts/audit/formulas.ts`) that fails when any switch has `saved_usd <> 0` while its execution state is not `automatic`, and a unit test over the pure helper. Regression cannot ship silently.

## Proof to produce on build

- `select ... from switches` after the migration showing zero captured dollars on every non-executable row.
- Screenshots of both new sections on `/demo/rightsize` and `/demo/govern`.
- Audit script output, red before the fix and green after.
