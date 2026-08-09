# Dispatch 154 — Provider-connection-gated switching: audit report

Plan mode. Nothing built. Audit of Robin's proposal against the real code, plus the detection mechanism, the Bedrock question, the status of Dispatch 152's other findings, and the copy.

## Verdict

The proposal is the right *shape* and I would build on it. But its central premise — "nothing new is asked of the customer beyond what they'd already need to do to use that provider at all" — does not survive the trace. Connecting a provider does **not** put a credential anywhere the rerouting path can reach it. One additional, explicit thing must be asked of the customer, and the honest version of this design has to say so out loud.

## Finding A — Connecting a provider gives no container a credential

This is the part that has to be corrected before anything else follows from it.

A container holds no provider credential of its own. The key arrives **on each inbound request** from the customer's SDK and is copied through untouched (`proxy.ts:19-51`, `CREDENTIAL_HEADERS` is a redaction list, never a store). Config carries exactly one `COSTMYAI_UPSTREAM_URL` and no key field (`config.ts:55-79`).

So consider the real flow after a customer has "connected Together AI" exactly as described — their account, their key, a second container on port 8790 pointed at Together:

- Their app calls **container A** (OpenAI) with their **OpenAI** key in the header.
- A switch says: send this to Together.
- Container A rewrites the destination. The request still carries the OpenAI key. Together rejects it 401.
- Container B is no help: it is also a pass-through with no key. It only ever had a key because the customer's app put one on a request — and the customer's app is not calling container B for this workload.

Connecting provider B proves the **account exists** and gives us the **base URL and wire shape**. It supplies no credential for a request the customer's app did not originate against B. The gap Finding 1 named is narrowed, not closed.

**What actually closes it:** the customer explicitly hands provider B's key to the container as configuration — for example `COSTMYAI_ROUTE_KEY_TOGETHER`. Three things are true about that and all three should be stated plainly:

1. The container runs in the **customer's own infrastructure**, so the key still never leaves their environment and CostMyAI still never holds it. The strongest public claim survives intact.
2. It does break the narrower internal rule that the container never holds a credential at all (DECISIONS.md §1-2). That rule is currently absolute; under this design it becomes "never for pass-through, only for destinations the customer explicitly enabled."
3. It is a real ask: a config change and a container restart per destination provider, not zero.

I recommend keeping the proposal and correcting the framing: **executability is gated on the customer having connected the provider *and* granted routing to it.** Two states, both customer-initiated, both revocable by them alone.

## Finding B — Detection mechanism

There is no connected-provider registry today. `api_keys` is org-scoped with no provider column; nothing in the codebase tracks connected providers (only one incidental comment mentions the phrase). So detection has to be built, and the only real evidence available right now is observed traffic.

Recommended two-signal check, both org-scoped and both real:

1. **Provider seen** — distinct `host` in `usage_rollups` for the org, `is_synthetic = false`, within a rolling window, compared against the switch's `to_host`. Both sides are already canonical keys (`resolve-host.ts` normalises on ingest, `switches.to_host` stores the canonical key), so this is a key-to-key comparison with no re-resolution in the client.
2. **Routing granted** — a per-provider record the container asserts when it starts with a route key configured, delivered on the same authenticated channel Dispatch 152 already requires. This is what distinguishes "you use Together" from "you have told our software it may send traffic there."

Live evidence of why signal 1 alone is not enough: the only real workspace on the system has exactly one non-synthetic host (`anthropic`) and its most recent daily rollup is **6 August** — three days stale as of today. A pure traffic-presence check would flip a switch's affordance from actionable to "not connected" purely because a workload went quiet. So the window must be generous (30 days), the state must be sticky once seen, and the label must never silently regress from actionable to blocked while a switch is live.

The demo workspace must derive these states from its seeded rows deterministically rather than by querying real traffic, or `/demo` will show whatever the synthetic generator last happened to emit.

## Finding C — Bedrock: yes, this genuinely fixes it

This is the strongest part of the proposal and it holds up.

Dispatch 152 called Bedrock "never rewritable" for a precise reason: SigV4 signs the body and path, so any in-flight edit invalidates the signature and the call fails 403 — and a proxy holding no key cannot re-sign. That reasoning is entirely conditional on holding no key.

Once the customer has explicitly granted routing to Bedrock with their own AWS credential, the container is no longer rewriting someone else's signed request — it **constructs and signs a fresh one**. Signature validity stops being a blocker.

Two real caveats, so this is confirmed rather than assumed:

- It is a genuine implementation, not a config flag: canonical request construction, SigV4 with the right region and service, and Bedrock's own path and body shape (`/model/{id}/invoke`), which differs from the source shape it is translating from.
- Same-provider Bedrock model swaps still need it. Even model-only rightsizing on Bedrock changes the path, and the path is signed.

So: Bedrock moves from "impossible" to "a bounded piece of work, in the credentialed-destination design only." That is a real change to the Dispatch 152 conclusion and I am glad it was challenged.

## Finding D — The other four findings from Dispatch 152

- **Control channel / polling** — unchanged and still net-new. `billing-poll.ts` remains a pure function nothing calls; there is still no inbound channel. This proposal adds to it: the feed must now also carry per-provider routing-grant state.
- **Server-side match keys** — unchanged and now slightly more important. The container must not re-derive canonicalisation to decide whether a destination is connected; the same resolution that produced `to_host` must produce the comparison keys.
- **`saved_usd` event fields** — unchanged. Still needed, still a version bump.
- **Consent, kill switch, rollout safety** — unchanged in necessity, and this design *simplifies the consent conversation*: the customer supplying a route key for a specific provider is itself a strong, explicit, per-provider consent signal, which is much better evidence of informed intent than a single global toggle. It does not replace the disclosure headers or the kill switch, and it does not replace the `v2`-tag rollout rule.

Net: three of four unchanged, one meaningfully improved.

## Finding E — The 2-3 minute framing

Directionally right for most of the catalogue, wrong for the providers a serious customer is most likely to be on.

- **Genuinely 2-3 minutes** — the OpenAI-compatible long tail: Together, Fireworks, Groq, DeepInfra, OpenRouter, Novita, Mistral, xAI, and most of the rest of the 70. Sign up, card, key, done.
- **Materially more** — AWS Bedrock (account, IAM policy, and per-model access requests that are not instant for every model), Google Vertex (GCP project, billing account, service account, per-region model enablement), Azure OpenAI (resource creation plus a named deployment per model per region, and the deployment name — not the model name — is what the API takes).
- **Not self-serve at all** — the enterprise tier: Databricks, Snowflake Cortex, IBM watsonx, Oracle OCI. Contract or existing tenancy.

The bigger omission in the framing is not setup time, it is **account tier**. A brand-new account on the cheaper provider starts at the lowest rate limit. A workload that runs fine at scale on the incumbent can hit 429s on day one at the destination, and under this design that failure is caused by our switch. The 210-minute ceiling is a fair worst case for *setup*; it is not the real cost. That belongs in the recommendation copy, not buried in a runbook.

## Finding F — Proposed copy

`SwitchCard` already has the right pattern: `pendingTraffic` renders state instead of an action, ahead of every action branch. These slot into the same position, same precedence rule.

Three states, in precedence order:

1. **Provider not connected** — label `Connect {Provider} first`, with: "This switch sends traffic to {Provider}. Connect it the way you connected {CurrentProvider} — your account, your key, your container. We never hold the credential."
2. **Connected, routing not granted** — label `Allow routing to {Provider}`, with: "{Provider} is connected and reporting. To let a switch send traffic there, give that container its own {Provider} key. It stays in your environment; we never see it."
3. **Switch active, traffic not moved** — existing `PENDING_SWITCH_LABEL`, unchanged.

Both new labels must come from the real per-workspace check, be rendered as state rather than as a disabled button, and never appear on `/demo` except from seeded state.

Separately, and I think necessary: any recommendation whose destination is a provider the customer has never used should carry a one-line note that a new account starts on that provider's lowest rate tier. That is the honest version of the 2-3 minute claim.

## My recommendation

Adopt the proposal with the correction in Finding A, and split executability into the two states above rather than one. Recommendations stay unrestricted across the full market, which is already how the engine behaves — nothing filters by connection today, and nothing should start.

I do not see a better design. The alternatives are worse: CostMyAI holding provider credentials (destroys the core claim), or never executing cross-provider switches at all (leaves the largest real savings permanently advisory). Robin's instinct — put the credential decision in the customer's hands, per provider, in their own infrastructure — is the correct one. It just has to be described as what it is, which is a real, explicit, per-provider grant rather than a free consequence of already using the provider.

One sequencing consequence: with routing grants in the design, the Dispatch 152 phasing gets cleaner. Phase 1 is still same-host model swap (no grant needed at all, since the container is already fronting that provider). Phase 2 becomes granted cross-provider routing for OpenAI-compatible and Anthropic shapes. Bedrock and Vertex become Phase 3, on their own, because each is a signing or an auth implementation rather than a rewrite.
