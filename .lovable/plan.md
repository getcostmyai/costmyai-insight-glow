# CostMyAI — build order (v6, final)

## Design scope — two visual languages, scoped by page type

**Dashboard** (Overview, Compare, Certify, Rightsize, Govern, Settings, Workspace): current build preserved **exactly** — dark hero card, existing palette and tokens, captured ring, card styling, layout, typography. No changes.

**Marketing / front-facing** (front page, pricing, about, blog, docs, legal): light, Apple-style, spacious. **Not** the dark-hero dashboard style. Built from the real brand gradient values, defined once and reused — never redefined per page:

```css
--gradient-brand: linear-gradient(135deg,#6366f1 0%,#7c3aed 55%,#9333ea 100%);
--gradient-brand-soft: linear-gradient(135deg,rgba(99,102,241,.82) 0%,rgba(124,58,237,.82) 100%);
--wash-hero: radial-gradient(ellipse 130% 100% at 50% 0%,rgba(123,97,255,.17) 0%,rgba(255,255,255,0) 90%);
--wash-section: radial-gradient(ellipse 120% 80% at 50% 0%,rgba(123,97,255,.13) 0%,rgba(255,255,255,0) 85%);
--texture-dots: radial-gradient(circle,hsl(var(--muted-foreground)/.09) 1px,transparent 1px); /* 26px pitch */
```

One `.btn-gradient` utility on `--gradient-brand` for every CTA button and solid-fill CTA block; `--wash-hero` behind hero sections, `--wash-section` behind secondary ones; `--gradient-brand-soft` for the heavier card state; dots optional for depth.

**Both languages:** the CostMyAI wordmark with "My" in brand purple, and the hard no-serif-numerals rule.

**No serif numerals — hard constraint, everywhere.** Every dollar figure, token count, percentage and date renders sans-serif or a tabular-numeral mono face, regardless of the page's headline/body font. Enforced by a check over number-rendering components run in CI, not left to review.

**Zero-credentials:** schema invariant enforced by a test that fails on any credential-shaped column. No server-side provider key, no `openai-billing-fetcher.ts`, no `OPENAI_ADMIN_KEY`. Billing reconciliation is customer-push only.

**Deliberately deferred:** cross-tenant admin/oversight panel (managing orgs across tenants, manual plan-entitlement adjustment). Not in Phases 1–8 beyond Phase 7's partner-tier override tooling; scoped separately when needed. Recorded as a decision, not a gap.

### Phase 1 — Schema, benchmark sync, engine *(starts now)*
Migrations first: full model incl. `benchmark_margins`, `pricing_snapshots`, billing captures/reconciliations, `routing_rules` (no credential column), `plan_entitlements`, `objectives`, `is_synthetic` on every tenant-scoped table, GRANTs and RLS throughout.

Then the **live Artificial Analysis sync** (24h) — real sync only, no manual-entry path; fixture-backed for dev/test until access lands, never surfaced as product data.

Then the **engine**: one shared cost function (C3) and four separately-tested checks — arbitrage with deterministic tie-break; equivalence picking the **cheapest model clearing the bar**, bar from the stored per-benchmark margin not a hardcoded 1.0 (C1, C2), discrimination/Goodhart as real code; **rightsize as a first-class check** (observed shape only, computed for every org on every plan to power the upsell teaser); autonomous gate overlapping the equivalent band (C5). **Objective selection (Clause 07)**: cost default, latency and quality-floor as real alternatives, per-workload overriding account-wide.

*Tests:* C1 tie + alphabetical fallback; C2 boundary both directions; each objective winning differently on one fixture; rightsize matrix incl. correct-size negatives; autonomous gate + cooldown; credential-column schema test.

### Phase 2 — Synthetic ecosystem *(parallel once schema lands)*
Live pricing from day one; benchmarks on fixtures until access arrives, since the generator produces **traffic, never verdicts**. $15–20k/month solved backwards per model against live pricing and re-solved on price change; concentrated power-law distribution; **no showcase floor**; drift posted through the same public ingest endpoint a real customer uses every 30–120s; workload-set evolution on ~week ramps; `is_synthetic` isolation via RLS predicate and write-side guard; external demo gated behind a flag until live sync is on.

**Visibly live numbers:** tokens in/out, requests and spend all move within a minute or two — real rate underneath, honest interpolation between ~10s refreshes reconciling to the true value, precision chosen so movement shows, counters freeze if the generator stops. Tested at t=0/t=90s per counter, plus reconciliation and freeze tests.

### Phase 3A — Ingestion hardening
`/api/public/v1/events` and `/api/public/v1/billing`: hashed org-scoped tokens, Zod rejecting any prompt/content field, idempotent, batched, rollups, versioned payload contract.

### Phase 3B — Verification Engine + customer onboarding
Existing `packages/gateway` / `gateway-container` **repointed, not rebuilt** — local execution-key resolution, pass-through proxy and token counting preserved; endpoint paths read from one config constant; auth switched to the new ingest token; audit-flagged code dropped on the way through. Ships `@costmyai/engine` (npm) and the container image, dashboard-generated ingest token (shown once, hashed, rotatable, last-seen), **offline-safe local queueing so a CostMyAI outage never affects customer inference**, and a quickstart verified by executing it verbatim in a clean environment.

**First-connection 30-day backfill (brief §1, data sources).** The container's `billing-poll.ts` keeps per-provider connection state. On the *first* poll after a provider is connected it uses a **30-day lookback** instead of the standard rolling window, so a new customer sees a real reconciled month on day one instead of watching it accumulate — the same principle the synthetic demo gets from its historical seed. Every subsequent poll reverts to the rolling window. The backfilled periods push through the same `/api/public/v1/billing` contract, are idempotent per `(org, provider, period_start, period_end)` so a re-run or reconnect cannot double-count, and reconciliation runs over the backfilled months as soon as they land. Where a provider caps invoice history below 30 days, the shortfall is surfaced as a coverage note rather than silently truncated. Same rule for the metadata side: a customer who has usage history available from an existing gateway log may replay up to 30 days through `/api/public/v1/events`; idempotency keys make the replay safe.

*Tests:* clean-container quickstart run; network-partition drain test; payload capture asserting no prompt content; **configured-paths-match-live-routes test**; rotated-token error clarity; **first-poll-uses-30d / second-poll-uses-rolling-window assertion**; **double-run backfill asserted to produce exactly one capture per provider-period**; short-history provider asserted to yield a coverage note, not a silent gap.


### Phase 4 — Dashboard rewired *(dashboard design untouched)*
Real queries and live engine output behind the existing components; locked rungs show real previews incl. the rightsize teaser; objective selector surfaced; "waiting for first event" state wired to 3B. *Tests:* period toggle headline vs direct engine call, **and every list asserted to filter by period** (11-day-old rule present at 30d, absent at 7d, per list); visual regression asserting hero/ring/cards unchanged.

### Phase 5 — Accounts, plans, gating
Auth, org invites, Stripe, one server-side `requirePlan(tier)`, `LAUNCH_FREE_UNTIL` single-sourced (C7).

### Phase 6 — Switching
Manual switch writing `routing_rules` the engine polls; measured before/after. Then Govern: policy editor, autonomous writer, kill switch, rollback, full audit.

### Phase 7 — Partner / affiliate program
`partners`, `partner_users` with own auth surface and RLS boundary, `partner_tiers` ($5K/$10K/$40K/$130K → 15/20/25/30/35%), `referred_by_partner_id`, `commission_ledger` with lifetime semantics and payout status; partner dashboard; admin tier assignment with audited override. Movable to directly after Phase 5.

### Phase 8 — Marketing surface + copy
Marketing pages built in the light Apple-style language above on the shared gradient tokens; freshness sourced live from `pricing_snapshots.synced_at` (C6); resolver docs corrected (C4); C8 dead re-check and `hosts[0]` assumption removed; pricing and legal. *Tests:* no-serif-numeral check across marketing components; CTA audit asserting every CTA resolves to `.btn-gradient`.

**Not built:** Analyzer CSV page or route, server-side provider billing fetch, manual benchmark entry, compatibility shims for retired ingest paths, cross-tenant admin panel (deferred, above).

**Needed from you:** Artificial Analysis API access (key + tier) when convenient — nothing else blocks Phase 1.
