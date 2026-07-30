# CostMyAI — path to market-ready

## Answer up front

Yes, this is buildable end to end here, with two honest boundaries:

1. **The verification engine runs in the customer's environment.** It is a middleware/proxy package they install — it cannot live inside this web app. What lives here is the ingest API it posts metadata to, the API-key system, and the docs/snippets. Your Replit version can be salvaged for this; I'd rewrite it as a small, dependency-light package with one job: forward the request unchanged, emit `{model, host, task_hint, input_tokens, output_tokens, latency, status}` — no prompt content.
2. **Certify and Rightsize need real benchmark data.** I can build the schema, the equivalence scoring, the price matrix and the admin tooling to load and version it — but the quality data itself must come from you (your benchmarks, or a licensed/scraped public set). Without it, Certify recommendations are not defensible, and defensibility is the whole product.

## Stack decision

Lovable Cloud (Postgres + auth + server functions), not Clerk + Neon.

- Neon vs Cloud Postgres: same Postgres. Cloud removes a second account, a connection-pooling setup and a separate migration pipeline. No functional upside to Neon at your stage.
- Clerk's real upsides are polished org/team management and enterprise SSO. Cloud covers email+password, Google, Apple and SAML SSO natively; org/seat modelling I'd build as a `organizations` + `memberships` + `user_roles` schema, which you need anyway for plan gating. Revisit Clerk only if you sell to enterprises demanding SCIM provisioning.
- Stripe: native Lovable payments integration, no key wrangling, test mode from day one.
- Loops: connected via secret + server-side API calls for lifecycle email (welcome, connect-your-stack nudge, weekly savings digest, trial/upgrade, switch-activated receipt).

## Build order

### Phase 0 — Replit triage (before I write product code)
You give me the Replit repo (zip or GitHub). I audit it and produce a written verdict per module: keep / rewrite / kill, with the reasoning. Specifically I need to see:
- the verification-engine middleware
- the ingest endpoint and its payload shape
- whatever price matrix / host catalogue exists
- any benchmark or quality-equivalence data
- current DB schema

Output of this phase is a short report plus a canonical event schema. Nothing is ported blindly.

### Phase 1 — Data model and analysis engine (the core)
- Schema: `organizations`, `memberships`, `user_roles`, `api_keys` (hashed), `usage_events` (raw metadata), `usage_rollups` (hourly/daily aggregates), `model_catalog`, `host_prices`, `benchmarks`, `equivalence_pairs`, `workload_profiles`, `recommendations`, `switches`, `switch_events`. RLS on everything, org-scoped.
- **Compare**: join observed `(model, host)` against `host_prices`, project monthly saving from the org's own volume. Deterministic, no benchmarks needed — this is why it's free.
- **Certify**: Compare, then candidate models within a quality band from `benchmarks`, filtered by task class. Emits a certified/refused verdict with the basis recorded, so the dashboard can keep showing "4 certified · 8 refused".
- **Rightsize**: adds workload complexity classification (token shape, task hint, output length distribution) vs model tier → flags oversized usage with wasted-spend estimate.
- **Govern**: the same pipeline plus an autonomous policy evaluator (guardrails: max spend delta, quality floor, rollback on error-rate spike) writing switch decisions.
- Recomputation runs as a server function on a schedule; dashboard reads materialised `recommendations`.

### Phase 2 — Ingestion
- `POST /api/public/v1/events` — API-key auth (hashed, org-scoped), Zod-validated, batched, idempotent. Explicit rejection of any prompt/content field.
- Key management UI, rotation, last-seen indicator, "waiting for first event" onboarding state.
- Rollup job so the dashboard never scans raw events.

### Phase 3 — Accounts, billing, gating
- Auth: email+password and Google. Org creation on signup, invite teammates.
- Stripe: four products, monthly + annual prices — Compare free · Certify $69/$58 · Rightsize $389/$324 · Govern $899/$749. Checkout, customer portal, webhook → `subscriptions` table.
- One server-side `requirePlan(tier)` gate used by every analysis function and route. Locked tiers show a real preview of what they'd unlock, priced against the $50–80 competitors.
- Loops lifecycle emails on the events above.

### Phase 4 — Manual + autonomous switching
- Rightsize: manual switch from the dashboard → writes routing config the engine polls; before/after tracking so "saved since" is measured, not modelled.
- Govern: policy editor, autonomous switch log, kill switch, rollback.

### Phase 5 — Market-ready polish
- Marketing site with your architecture diagram, pricing page, docs/quickstart, legal pages, analytics, seeded demo org so prospects see a full dashboard before connecting anything.

## Technical notes

- Lovable Cloud is Postgres with RLS; every table is org-scoped and roles live in a separate `user_roles` table (never on profiles) to avoid privilege escalation.
- Analysis runs in server functions; the ingest endpoint is a public server route with signature/key verification inside the handler.
- Scheduled recomputation via pg_cron hitting a public route with a shared secret.
- Existing dashboard UI stays — it gets rewired from `src/lib/dashboard-data.ts` to real queries, so the design work you already approved is preserved.

## What I need from you

1. The Replit repo.
2. Whatever benchmark/quality data exists, and where the price matrix comes from (manual, scraped, provider APIs).
3. Confirmation of the free-tier limit for Compare (e.g. events/month or connected models).

## Suggested first step

Phase 0 + Phase 1 schema in one go: I audit Replit, then land the database and the Compare engine end to end against seeded data. That gives a working, provable core before any billing code exists.
