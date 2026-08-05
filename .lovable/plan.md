# Dispatch 99+100 — Spec review against the real codebase, then the build plan

Review first, as asked. Everything below was read in the current tree, not assumed.

## A. Real findings — things the spec gets wrong, misses, or collides with

**1. `task_hint` has no "unknown" and cannot get one without a contract change. (blocking)**
`src/lib/ingest/schema.ts` types it `z.enum(["generation","code","classification"])`, required, on a `.strict()` object. So today a real connector has exactly three choices, all of them a guess: label every real request "generation", refuse to send, or 422. The spec's "default to unknown and rely on the honest-refusal path" is not currently possible. Everything that consumes the label (Certify's discrimination gate, k-anonymity cohorts, the "Overpowered for the task" cards, `usage_rollups`' unique key which includes `task_hint`, `switches.functions.ts` matching) was only ever exercised on seeded data where the label was authored by `src/lib/synthetic/workloads.ts`. There is no classifier anywhere in the codebase. Adding `"unknown"` touches the ingest schema, the rollup key, the recommendation matchers and the UI copy — it is its own stage, before the connector can send a single honest event.

**2. The "we backfill the previous 30 days on connect" promise cannot be kept by billing-poll. (blocking, honesty)**
`src/lib/dashboard/onboarding.ts:50` promises 30 days of *history*. `billing-poll.ts` + `backfill.ts` only produce **invoice totals per provider-month** — no per-model, per-host, per-task events, so no chart, no comparison, no switch. Real per-request history can only come from the unbuilt `costmyai replay` CLI in README §5. Stage 1 as written ("a freshly connected container actually produces 30 days of real history") is not achievable via billing poll. Pick one: build the replay CLI, or reword the promise to "reconciled invoice totals for the last 30 days; per-request history starts now".

**3. `InvoiceReader` has zero implementations.** `billing-poll.ts` takes an interface; nothing anywhere implements it for OpenAI, Anthropic or Google. Stage 1's "wire and test billing-poll" is really "write three real billing-API clients, each with its own credential shape, pagination and currency handling". Not a wiring job.

**4. There is nowhere to put "unparsed".** The ingest event schema is `.strict()` — any extra field is a 422 by design (that strictness is the credential guarantee). So Stage 2's "flag as unparsed rather than dropping" requires an additive optional field on the v1 contract (e.g. `parse_status: "parsed" | "tokens_only" | "unparsed"`). Without it the only signal is `0/0` tokens, which is indistinguishable from a real empty response and from unpriced traffic.

**5. Quickstart contradiction is worse than "port and image name".** `src/routes/_authenticated/settings.tsx:249` says `COSTMYAI_ENDPOINT`, port `8080`, image `costmyai/gateway:latest`, no volume. `packages/gateway-container/README.md` says `COSTMYAI_BASE_URL`, port `8787`, `ghcr.io/costmyai/gateway:latest`, with a spool volume. `loadConfig()` reads `COSTMYAI_BASE_URL` — so the settings page, the thing a real customer copies, is the wrong one. Constants must live in `src/lib/ingest/contract.ts` (UI imports app code; the container already mirrors from there) — not the other way round.

**6. `packages/gateway-container` is not a package and its imports escape it.** `config.ts` imports `../../../src/lib/ingest/contract`. That file is dependency-free and alias-free, so it works — but only if the Docker build context is the repo root. There are no workspaces in the root `package.json`. Decide now: repo-root build context with a copied contract file, or a genuine bun workspace.

**7. New connector tests must live under `src/`, or the audit cannot see them.** `scripts/audit/test-isolation.ts` walks `src` only, matching `*.integration.test.ts`. A test under `packages/` is invisible to the guard check — exactly the class of mistake Dispatch 94 exists to prevent. Precedent already exists: `src/lib/ingest/__tests__/ingest.test.ts` imports container code from `src`.

**8. `idempotency_key` should be mandatory for the connector.** The upsert uses `onConflict: "org_id,idempotency_key"` while the schema makes the key optional. Null keys do not dedupe reliably. The connector must always mint one per request, or spool retries over a flaky network (Stage 0's explicit concern) can double-count.

**9. `rebuildRollups` is a heavy synchronous job on the ingest request path.** Every accepted batch re-reads up to 500 pages of events plus the whole price table and rewrites hour+day buckets. It has only ever run against the internal synthetic tick. Real concurrent customer traffic at 1000 events/batch will hit Worker CPU limits. The public ingest routes also have no rate limiting or abuse protection.

**10. `PROVIDER_HOSTS` covers 11 providers, not 71.** Host attribution for the other 60 falls through to "keeps its own name, unpriced". Honest, but it means most real customers see unpriced traffic on day one. Stage 5's shape enumeration should produce the host map at the same time.

**11. Stage 6 cannot be completed from this environment.** No Docker, no GHCR credentials. Image build/publish and the "pullable from a machine that didn't build it" proof need Robin's registry credentials and a CI runner. The audit wiring can be built here; the publish cannot.

**12. Reuse, don't invent:** `src/lib/ops/jobs.ts` + `src/routes/_authenticated/admin/jobs.tsx` already exist for internal signals — Stage 5's alerting belongs there. `src/lib/pricing/sync.server.ts` already computes `modelsNew` per run — the new-provider hook attaches there, not in a new sync.

**Agreed as specified, no changes:** key-injection decision, no-retry rule, byte-identical error passthrough, bounded spool, v1 contract marker (already present), concurrency, timeouts, scope boundary, SIGTERM flush, true streaming, and the metadata-only privacy boundary.

## B. Revised build plan

**Stage 0 — Decisions + the task_hint prerequisite**
Written decisions doc in the package. Locked recommendation: **pass-through** — the customer's app keeps sending its own key, the proxy never holds one (matches zero-credentials; the injection variant makes the container a credential store).
Then land `task_hint: "unknown"`: ingest schema, rollup key, recommendation matchers, and UI copy that refuses to rank an unknown-task cohort rather than guessing. Classification stays a coarse label derived from endpoint path and model family only — never response or prompt content — and defaults to `unknown`.

**Stage 0b — Contract additions (v1, additive):** optional `parse_status`, mandatory-in-practice `idempotency_key`, shared `CONTAINER_DEFAULTS` (port, env names, image ref) in `contract.ts`, asserted against the settings page and README in CI the way `INGEST_PATHS` already is.

**Stage 1 — Real package:** `package.json`, `Dockerfile`, `src/index.ts` wiring `loadConfig` + `UpstreamQueue`, SIGTERM flush, health endpoint. Backfill scope decided per finding 2; if replay is chosen it ships here as `costmyai replay`.

**Stage 2 — Generic proxy:** one configurable upstream per instance, verbatim forward, streamed passthrough, no retries, timeout, credential-safe logging proven by a deliberate failure. Parsers for OpenAI-compatible, Anthropic, Gemini — non-streaming and each one's real streaming terminator — plus `parse_status` for anything else.

**Stage 3 — Disk-backed spool** with size and age bounds and oldest-first eviction, written at request-completion time.

**Stage 4 — One reconciled quickstart** from the shared constants, settings page and README both generated from them.

**Stage 5 — Tests by shape + alerting:** enumerate real response shapes across the 71 tracked providers from their live docs and report the real count and mapping; one E2E per shape plus a second provider on an already-proven shape; all of it under `src/**/*.integration.test.ts` with `guardIntegrationDatabase`. Unparsed shapes raise an ops job signal; the pricing sync flags genuinely new providers for a one-time shape check, proven on a real sync run.

**Stage 6 — Publish + audit:** add `audit:connector` to `scripts/audit/all.ts` (container build + E2E). Image publish handed to Robin with exact commands, since this environment has neither Docker nor registry credentials.

Reporting stage by stage with real proof at each, as asked.
