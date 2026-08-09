# Dispatch 152 — Live traffic rerouting: review report

Plan mode. Nothing built. This is a review of the proposed scope against the real code, with a recommendation on each open decision and a stage plan for later approval.

## Verdict up front

The scope is buildable, but two of its load-bearing assumptions are wrong, and one of them inverts the recommended phasing.

1. **Arbitrage (same model, different host) is the hardest case, not the safest.** It is currently infeasible without breaking the zero-credentials guarantee.
2. **There is no proven polling pattern to reuse.** `billing-poll.ts` is a pure function that nothing calls — it is not wired into `index.ts`, has no timer, and the container has no inbound channel of any kind.

Everything else in the scope survives review, with additions listed below.

## Finding 1 — Cross-host rerouting needs a credential the container does not have and is not allowed to have

`loadConfig()` (`config.ts:63`) requires exactly one `COSTMYAI_UPSTREAM_URL`. One container fronts one provider. The customer's provider key arrives on the inbound request and is copied through untouched; the container holds no credential of its own (`proxy.ts:19-29`, DECISIONS.md §1-2).

To send a call to a different host, the container would need:

- that host's base URL (derivable — `PROVIDER_HOSTS` / `PROVIDER_PRESETS` already map this),
- **the customer's API key for that host** (it has none, and asking for it destroys the single strongest claim the product makes), and
- **a wire-format translation** — `switches` rows carry canonical host keys (`openai`, `together`, `deepinfra`), and moving an Anthropic-shaped `/v1/messages` body to an OpenAI-shaped `/v1/chat/completions` endpoint is a body, path, header and response-shape rewrite, not a destination change.

The scope's claim that arbitrage is "lowest risk: only the destination changes" holds only for OpenAI-compatible host to OpenAI-compatible host, and even then a second credential is mandatory. Realistic paths, all of which need Robin's decision before any of it is scheduled: run one container per host and let it forward to a sibling container that holds the other key; accept a second key in the container's own env (explicitly weakens the guarantee); or never reroute across hosts and keep arbitrage as a recorded recommendation the customer executes.

**Same-host model swap needs none of this.** The credential, the base URL and the wire format are all unchanged. That is Rightsize by construction (`switches.functions.ts:129` — "Right-sizing swaps the model, never the provider"), and it is the subset of quality-matched switches where `to_host == from_host`.

## Finding 2 — There is no control channel, and no polling precedent

`UpstreamQueue` is outbound-only, POST-only, to two paths (`INGEST_PATHS`). The ingest token authorises writes; nothing reads. `pollProvider()` is referenced only by its own tests. So item 1 of the scope is not "reuse the billing-poll pattern" — it is net-new: a read endpoint, a token scope that permits reads, a poll loop with jitter and backoff, an in-memory map, a staleness bound, and defined behaviour when the map is stale or was never fetched.

Non-negotiable default: **unknown or stale state means pass-through.** A CostMyAI outage must never change what the customer's traffic does, in either direction.

## Finding 3 — The container cannot match a switch on its own

Switches are keyed on canonical `model | host | task`. The container sees raw values; canonicalisation lives server-side in `resolve.ts` and `resolve-host.ts`, and `task_hint` comes from `classify.ts` on path plus model family. Re-implementing resolution in the container creates a second source of truth that will drift — exactly the Dispatch 96 failure.

Correct design: the poll response ships **pre-resolved match keys** computed server-side — the raw model strings and host aliases that map to each active switch — and the container does literal matching only.

## Finding 4 — Rewriting is shape-specific, and one shape cannot be rewritten at all

The body is already buffered (`proxy.ts:105`), so mechanically a rewrite is easy. Per shape:

- **OpenAI-compatible, Anthropic** — `model` is a JSON body field. Rewritable.
- **Gemini** — the model is in the path (`/v1beta/models/...:generateContent`). Path rewrite, not body rewrite.
- **Bedrock** — SigV4 signs the request body and path. Any rewrite invalidates the signature and the call fails 403. **Not rewritable, ever, from a proxy that holds no key.** Must be explicitly refused.
- **Cohere, Tencent** — need checking case by case before inclusion.

Also: `content-length` is stripped on the way out (`HOP_BY_HOP`), so a length change is safe, but any customer-computed body hash or idempotency key over the body is invalidated. Unsupported shapes must pass through untouched and report why, not attempt a best-effort rewrite.

## Finding 5 — The event contract needs new fields, and that is a version bump

`ProxyEvent` has no place to say "this was rerouted". After a rewrite, `parse.ts` reads the *new* model out of the response and `record()` prefers it, so the event would look like organic traffic on the destination model. That is precisely what makes `saved_usd` computable — but only if the event also carries `rerouted: true`, `original_model`, `original_host` and the `switch_id`. `INGEST_API_VERSION` is `1`; this is a breaking add and the server must accept both versions during rollout.

## Finding 6 — Consent, gating and a kill switch

`index.tsx:674` publicly refuses to build something that "silently reroutes traffic". Meeting that in substance requires all four of:

- workspace-level opt-in that is a real server-side gate, not UI state;
- `requirePlan` on the enable path (the container has no notion of plan — the **poll endpoint** must return an empty switch set for an unentitled workspace);
- a per-request disclosure header on every rewritten call (`x-costmyai-rerouted: 1`, original model/host, switch id) plus a `switch_events` row the first time a workload is actually rerouted, which is also the first real proof that a switch did anything;
- a customer-side kill switch that does not depend on us: an env flag on the container that disables rerouting regardless of what the poll returns.

Also a rollout hazard: the published tag is `v1` and the documented `docker run` uses `--restart unless-stopped`. Pushing rerouting to `v1` would silently change behaviour for every existing container. Rerouting ships on `v2`, opt-in, never on the tag existing customers already pulled.

## Recommendations on the three open decisions

**1. Phasing — phase it, but inverted.**
Phase 1 is **same-host model swap** (Rightsize, and quality-matched where the host is unchanged): no new credential, no wire-format change, no new failure class beyond the model itself. Phase 2 is Gemini path rewriting and the remaining shapes. Cross-host arbitrage is **Phase 3 and gated on a separate decision about credentials** — it may be the right answer to never build it and keep arbitrage advisory. Building both phases before either ships is worse here: Phase 1 is genuinely complete on its own, and its telemetry (how often a rerouted call fails) is the evidence that should inform Phase 2's policy.

**2. Failure policy — one disclosed fallback, strictly bounded.**
Hard-fail breaks traffic that would have worked, over a change the customer did not make request-by-request. Unbounded silent fallback hides a broken switch forever. Recommended middle: fall back to the original model **once**, only when the failure is deterministic and pre-billing — connection error, `model_not_found`, unsupported-parameter 400, or a 4xx from the destination — and **only before a single response byte has been emitted**. After first byte, never: retrying a partially delivered completion double-executes and double-bills, which is the rule `proxy.ts` already enforces for the pass-through path and which must not be weakened here. Every fallback sets a disclosure header, emits an event, and after N fallbacks in a window the switch **auto-pauses** and the workspace is told. That is fail-open on the request and fail-closed on the switch.

**3. Consent — the toggle is necessary but not sufficient.**
The Govern toggle governs *who decides* a switch, not *whether our software touches your traffic*. Those are different consents and should not be conflated. Recommended: a separate, one-time explicit acknowledgment when rerouting is first enabled for a workspace, recorded with actor and timestamp, naming exactly what will change and how to turn it off — plus the per-request disclosure headers, which are what make the claim auditable rather than promised.

## Proposed build plan (for approval, not execution)

1. **Contract and gate.** Event fields, `INGEST_API_VERSION` bump with both versions accepted, the rerouting opt-in column and acknowledgment record, `requirePlan` on enable, server-side resolution of switch match keys.
2. **Read endpoint.** Authenticated `GET` switch feed scoped to the token's workspace, returning pre-resolved match keys, an `enabled` flag, and a poll interval; empty for unentitled or un-acknowledged workspaces.
3. **Container control plane.** Poll loop with jitter and backoff, in-memory map, staleness bound, env kill switch, `/healthz` exposure of the current map and last poll — no request-path behaviour change yet.
4. **Rewrite, same-host only.** Model field rewrite for OpenAI and Anthropic shapes, explicit refusal for Bedrock and anything unrecognised, disclosure headers, rerouted event fields. Golden tests proving byte-identity is preserved for every non-matching request.
5. **Failure policy.** Pre-first-byte single fallback, fallback disclosure, auto-pause threshold, and the no-retry-after-first-byte invariant asserted in tests.
6. **Real proof and savings.** A real rerouted call on a real workspace, header-verified, event-verified; then `saved_usd` computed from observed rerouted traffic, reconciled against the dashboard tiles.

Gemini path rewriting, remaining shapes, and any cross-host work are separate dispatches after stage 6 reports real numbers.
