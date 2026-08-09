# Dispatch 155 — Provider-gated switching: staged build

Dispatch 154's revised design is approved as written. This is the build plan. Stage-by-stage, each stage reported with real evidence before the next begins — same discipline as the connector build.

## Locked decisions

- Two distinct gates: **provider connected** (real observed traffic, 30-day rolling, sticky) and **routing granted** (customer gave a container its own key for that destination).
- The "container holds no credential" rule becomes **scoped**: never for pass-through, only for a destination the customer explicitly granted. The key stays in the customer's infrastructure; CostMyAI never holds it. This gets written into `DECISIONS.md` as a deliberate, dated amendment, not a silent edit.
- Recommendations stay unrestricted across the full market. Only executability is gated.
- First autonomous switch to a provider the workspace has never executed a switch to requires one manual confirmation; subsequent switches to that provider are fully autonomous.
- Any recommendation whose destination the workspace has never used carries a visible new-account rate-tier note.
- Three affordance states in precedence order: not connected, connected-not-granted, existing pending-traffic label.

On the first-switch confirmation gate: I looked for a better mechanism and did not find one. A canary percentage or a time-boxed trial both need traffic-splitting the container does not have, and both delay the signal. One explicit confirmation per new destination is the cheapest thing that makes an untested relationship a decision rather than an accident. Building it as specified.

## Phases

- **Phase 1 — same-host model swap.** No routing grant needed; the container already fronts that provider with the customer's own key on every request. Ships first.
- **Phase 2 — granted cross-provider routing**, OpenAI-compatible and Anthropic shapes. Needs the grant mechanism, both detection signals, the new copy states, and the control channel.
- **Phase 3 — Bedrock and Vertex.** Real request construction and signing per provider, sequenced last.

## Stage 1 (this stage) — contract and gate

No rewriting happens in Stage 1. Nothing in the request path changes. This stage builds only the truth the later stages read.

1. **Ingest contract v2.** `INGEST_API_VERSION` goes from `1` to `2`. Both versions accepted for the whole rollout: `v` becomes a union, v1 batches keep today's exact semantics. New optional event fields — `rerouted` (bool), `original_model_key`, `original_host`, `route_reason` — all absent on v1 and on any unrerouted v2 event. `.strict()` stays; the content-free and no-credential guarantees are unchanged and re-verified in tests.
2. **Routing-grant storage.** A new `public.org_provider_routing` table keyed by org and canonical host: grant state, the container instance that asserted it, first-asserted and last-seen timestamps. Service-role write only; the container asserts its own grants over the authenticated ingest channel. Members read their own workspace's rows.
3. **Detection, both signals, server-side.** One resolver returning a per-workspace, per-host state of `not_connected | connected | granted`:
   - *connected* — distinct non-synthetic `host` in `usage_rollups` within 30 days, compared canonical-key to canonical-key against `switches.to_host`. **Sticky:** once a host has been seen it stays connected; the window is a floor for first detection, not an expiry. The live workspace's only real host (`anthropic`) last rolled up on 6 August, so a non-sticky window is a real regression risk, not a hypothetical.
   - *granted* — a live row in `org_provider_routing`.
   - Demo orgs resolve from seeded state, never from a traffic query.
4. **Server-side match keys.** The resolver and the future poll response both emit keys resolved by the same code that wrote `to_host`. The container never re-derives canonicalisation.
5. **`requirePlan` on enable.** Any routing-enable path takes `requirePlan(...)` as its literal first line, same rule as every other switch mutation.

### Stage 1 proof, before Stage 2 starts

- Both signals resolved against the real production workspace and both demo workspaces, output shown.
- The stale-traffic case proven explicitly: a workspace whose newest rollup is days old still resolves `connected`.
- v1 and v2 batches both accepted on the live endpoint; a v2 batch carrying a string in a content field still rejected 422.
- `requirePlan` present and first-line on every new mutation.

## Stages 2-6 (shape only; each gets its own report)

2. Authenticated read endpoint returning active switches plus resolved match keys and grant state.
3. Container poll loop and in-memory switch map. Non-blocking by construction: the request path only ever reads local state, never waits on us.
4. Same-host model rewriting (Phase 1 capability) with per-request disclosure headers.
5. Failure policy: single pre-first-byte fallback, disclosed, with an auto-pause threshold.
6. `saved_usd` reconciliation from real rerouted traffic.

## Technical notes

- `INGEST_API_VERSION` is currently `1` (`src/lib/ingest/contract.ts:12`); `ingestBatchSchema` pins it with `z.literal`, so the union is a real change to `src/lib/ingest/schema.ts`.
- Grants are asserted by the container, not entered in the UI: the customer's action is putting the key in their own container config, and the container reporting that is the honest signal. The UI shows state and can revoke, never invents a grant.
- The copy strings live in one module alongside `PENDING_SWITCH_LABEL` so `/demo`, Rightsize, and Govern cannot drift apart.
