# Decisions locked before the connector was written (Dispatch 99+100, Stage 0)

These are guarantees, not preferences. Each one is enforced somewhere in `src/`
and proven by a test in `src/lib/ingest/__tests__/connector.test.ts`.

## 1. Key injection: pass-through, never injection

**Decided: pass-through.** Your application keeps sending its own provider key
exactly as it does today. The container copies the `Authorization` header (and
`x-api-key`, `api-key`, and every other header) to the provider byte for byte
and never reads, stores, rewrites or logs it.

The rejected alternative — the container holding a provider key in its own env
and injecting it — would turn a metadata relay into a credential store. That
contradicts the zero-credentials promise the whole product rests on, and it
would mean a compromised container leaks a live provider key.

Practical consequence: your code changes one line, the base URL. Nothing else.

### Amendment, 9 August 2026 (Dispatch 155) — scoped, not withdrawn

This rule was absolute. It is now scoped, deliberately and with the reason
written down rather than discovered later in a diff.

**Unchanged, and still absolute: pass-through traffic.** The key your
application sends is still copied byte for byte, still never read, stored,
rewritten or logged. Nothing about the ordinary request path changes.

**The one exception: a destination you granted.** For a switch to send traffic
to a *different* provider, that provider must be paid — and the key on the
incoming request belongs to the provider your application called, not the one
we would be routing to. So a destination is executable only when you have
separately put that provider's own key in your own container
(`COSTMYAI_ROUTE_KEY_<PROVIDER>`), which is a distinct act from merely using
that provider elsewhere.

What this does not change: the key lives in your infrastructure, in a container
you run. It is never sent to CostMyAI, there is no field in the ingest contract
that could carry one, and we still cannot recover or read it. What it does
change: for granted destinations only, the container is no longer a pure relay —
it holds a credential you handed it, for exactly the destinations you named, and
you withdraw it by removing the variable or revoking the grant in Settings.

Traffic that is rerouted says so, per request, in a response header. There is no
mode in which this happens without disclosure.


## 2. Credentials never appear in any output

No log line, error message, health payload or upstream body ever contains a
credential. `redactHeaders()` drops every credential-bearing header before any
diagnostic touches it, and error paths use the same redaction as success paths.
Proven by deliberately failing a request carrying a key and asserting the key
string appears nowhere in captured output.

## 3. The proxied AI call is never retried

Not on timeout, not on 5xx, not on a dropped socket. A retried completion can
double-execute on the provider's side and bill the customer twice. Metadata
delivery to CostMyAI retries freely — it is idempotent and costs nothing.

## 4. Errors pass through byte-identically

A provider's 429, 400 or 401 reaches the caller with the provider's own status,
headers and body. The proxy adds nothing and reshapes nothing.

## 5. The spool is bounded

Disk-backed, capped by item count and by age (default 10,000 items / 7 days),
oldest-first eviction. A long CostMyAI outage costs you the oldest metadata,
never your disk.

## 6. The contract is versioned

Every payload carries `{"v": 1}`. An unknown version is refused loudly by the
server; an old container that never learned a newly added optional field keeps
working unchanged. New fields on v1 are additive and optional, always.

## 7. Concurrency

Node's HTTP server handles requests concurrently; nothing in the request path
takes a lock, awaits the upstream queue, or serialises on the spool. Proven with
a concurrent-load test, not sequential calls.

## 8. Timeouts

`COSTMYAI_UPSTREAM_TIMEOUT_MS` (default 120s) bounds the wait for response
headers. On expiry the caller gets a `504` naming the timeout — never a hang,
and never a retry.

## 9. Scope boundary

This connector proxies real-time request/response inference (chat, completions,
messages, generateContent), streaming or not. **Out of scope:** batch APIs,
fine-tuning, file upload, assistants/threads polling, and websocket realtime.
Those paths are still forwarded verbatim — the proxy never breaks them — but no
metadata is derived and the event is reported `parse_status: "unparsed"` rather
than guessed at.

## 10. Graceful shutdown

On SIGTERM/SIGINT the server stops accepting, drains in-flight requests, flushes
the spool to disk, attempts one final upstream drain, then exits.

## 11. True streaming

Response bytes are piped through as they arrive. Usage extraction reads a
bounded head window and a bounded tail window of the stream (16 KB each) — the
only two places any provider puts usage — so a 200 MB response costs 32 KB of
memory, not 200 MB.

## 12. Task classification: coarse, structural, defaults to unknown

`classifyTask()` reads **the request path and the model name only**. It never
reads, inspects, forwards or derives anything from prompt or response content.
Anything it cannot place structurally is reported as `unknown`, and the server
side treats an unknown cohort as uncertifiable — the ladder in
`src/lib/benchmarks/task-ladder.ts` refuses rather than borrowing an unrelated
instrument. A wrong label would silently corrupt Certify and the benchmark
cohorts; `unknown` costs a recommendation and lies about nothing.

### Amendment, 19 August 2026 (Dispatch 232/233) — scoped, not withdrawn

The first sentence above was absolute. It is now true of one release line and
false of another, and that is written here rather than left to be discovered in
a diff — the same treatment §1 got when route keys scoped it.

**What changed.** Structural classification could not label ordinary chat
traffic. Path and model name place an embeddings call or a completion endpoint;
they place nothing at all about what a `/v1/messages` request is *for*. So real
customer traffic arrived overwhelmingly `unknown`, the ladder refused it
honestly, and Certify — the product — was unreachable for the most common
workload there is. This was proven on real traffic, not argued: 140 real
Anthropic calls ingested for a test workspace produced zero certifiable
cohorts. Structural labelling was not conservative here, it was inert.

**What we did instead of loosening the refusal.** `classifyLocal.ts` derives a
label from request text **inside the customer's own container**, in their own
process, and emits one of six enum values plus a confidence number and feature
names such as `code.fenced_block`. No text is spooled, logged, retained past
the function return, or sent to CostMyAI, and there is no field in the ingest
contract that could carry any. It abstains — `weak_signal`, `ambiguous`,
`no_content`, `unreadable` — rather than guessing, because the reason a wrong
label is unacceptable did not change when the classifier got better eyes.

**Why the default is a property of the image tag, not of the source.** A
default is a decision about somebody else's compliance posture, so it is made
where the customer can see it:

- **`v1` — unchanged, and frozen.** That published image has no classifier in
  it at all. `COSTMYAI_CLASSIFY_LOCAL=true` on a `v1` container is a no-op,
  because the binary predates the variable. `v1` is a *moving* tag, so it is
  never rebuilt from a tree that contains the classifier; the publish workflow
  refuses. Anyone who re-pulls gets the container they agreed to run.
- **`v2` — classification on by default.** Built from the same source with
  `--build-arg CLASSIFY_LOCAL_DEFAULT=true`. Reached only by naming the tag,
  which makes taking it an act rather than a drift.
- **The customer's own variable always wins, in both directions.**
  `COSTMYAI_CLASSIFY_LOCAL=false` on `v2` is a real, honoured opt-out — a
  regulated deployment can take `v2` for its fixes without taking its posture.
  Unrecognised junk in either variable still resolves to OFF.

**The real cost of "on", stated rather than dismissed.** Even though no bytes
leave the customer's network, a container that inspects prompt bytes is a line
in their data map, their DPIA and their subprocessor attestations. "It stays
local" is true and does not make that paperwork disappear. That is why the
default belongs to a tag a customer chooses, and why the opt-out exists on the
tag that defaults on.

**What did not change.** Content is read only for labelling. Nothing is
retained. `unknown` is still the answer when evidence is weak, and the ladder
still refuses it rather than borrowing an instrument.


## 13. The envelope skeleton: content-free, and the only thing retained

Dispatch 106 needed something the connector had deliberately never kept: enough
of a response to re-read it later, when a parser it did not have at the time
ships. Retaining the body was never an option — the Charter is the product.

So a degraded reading (`tokens_only` or `unparsed`, never a clean `parsed` one)
carries an `envelope_skeleton`: the response's **structure and its numbers**,
with every string value erased. Keys survive because the parsers key off them;
numbers survive because they are the counters; string content cannot survive
because `envelopeSkeleton()` replaces every string with `null` before anything
leaves the process. It is bounded (depth 8, 400 nodes, 64 keys and 32 array
entries per level) so a pathological envelope cannot become a payload.

`isContentFree()` is the same predicate on both sides: the connector asserts it
before sending, and the ingest schema re-asserts it on arrival and rejects the
whole batch if a string ever appears. Neither side trusts the other.

The consequence is that a parser shipped in month six repairs traffic from month
one — `parse_status` is corrected, the rollups are rebuilt from the corrected
events, and the customer's history stops under-reporting. What can never be
recovered from a skeleton is what was never in it, and that is the point.

## §8 — Rewriting is narrow, refusals are loud (Dispatch 155, Stage 4)

The container may now change a request, and exactly one thing about it: the
`model` field of a JSON body, on a same-host switch (Phase 1), where it already
fronts that provider with the customer's own key. Nothing else is edited — not
the URL, not the headers, not any other field.

Everything not completely understood is **refused**, and a refusal forwards the
original request byte-for-byte: a SigV4-signed request (`signed_request`,
editing the body would invalidate the signature), a model-in-path shape such as
Gemini or Bedrock (`model_in_path`), a body that is not a JSON object with a
model field (`unrecognized_shape`), and any Phase 2 or Phase 3 entry
(`phase_not_supported`) — refused by the container independently of what the
plan says, not merely unreachable because the server has not marked them
executable yet.

Nothing is silent, in either direction. A rewritten call comes back with
`x-costmyai-reroute: applied` plus the original and actual model and host and
the switch id; a refused one comes back with `x-costmyai-reroute: refused` and
the reason. An untouched request carries no `x-costmyai-*` header at all, and
its ingest event carries no `rerouted` field — byte-identical to a v1 container.

## Fallback: when a reroute is undone, and when it is not (Dispatch 155, Stage 5)

A switch can send a request somewhere that refuses it. When that happens the
container sends the caller's own original request instead, once, and tells them
it did. The whole policy is four conditions, and they were chosen by one test:
**could the destination already have started billing?**

Falls back:

| Condition | Why it is safe |
| --- | --- |
| `connection_error` | The request never arrived. Nothing was generated. |
| `model_not_found` | The destination rejected the identifier before any work. |
| `unsupported_parameter` | A 400 on request validation, before any work. |
| `destination_4xx` | Any other 4xx: refused, not attempted. |

Never falls back:

- **Any 5xx.** The destination may have generated, and billed, a completion and
  then failed to hand it back. Retrying can charge the customer twice.
- **Our own timeout.** Same reason, and worse: the work is probably still
  running on the other side.
- **Anything after the first byte reaches the caller.** This is structural, not
  a flag: the fallback decision sits above the point where the response body is
  returned, so a stream that dies halfway through cannot reach it.

There is at most one retry, ever. The fallback attempt itself is never retried.

Both attempts are reported as real events — the failed rerouted one carries
`rerouted: true` and `fallback_reason`, the served one is honestly not rerouted
because it ran on the caller's own model. Disclosure on the caller's response is
`x-costmyai-reroute: fell_back` plus `x-costmyai-reroute-fallback`,
`x-costmyai-attempted-model` and `x-costmyai-model`.

Three fallbacks on one switch inside an hour pause that switch automatically,
server-side. The pause is written to `switch_events` with the reason in plain
words, shows up in the customer's paused list, and raises an ops alert. A switch
that keeps sending traffic back where it started should not keep charging every
request the latency of two attempts to end up nowhere.

## Savings are observed, and withheld when unsourceable (Dispatch 155, Stage 6)

`switches.saved_usd` is no longer an estimate carried over from the
recommendation. It is recomputed from stored events: every rerouted, `ok`,
non-fallback event is priced twice against live `host_prices` rows — once for
the model that actually ran, once for the model the caller asked for — and the
signed difference is the saving. Recomputation runs on ingest, so the tile is at
most one batch behind the traffic.

Three consequences, all deliberate:

- **A negative saving is shown as a negative saving.** If the destination turns
  out dearer on real token mix, the number goes down. There is no `max(0, …)`.
- **Delisted prices do not value anything.** The engine reads only
  `is_active` rows, so a withdrawn price cannot quietly back a claim.
- **An unpriced pair is counted, not guessed.** Traffic through a host we hold
  no price row for (aggregators, self-hosted endpoints) lands in
  `unpricedEvents` and contributes nothing. The reroute provenance is still
  recorded in full; only the money is withheld. Closing that gap means adding
  real price rows for those hosts, never inferring one from another host.


### Amendment, 9 August 2026 (Dispatch 163) — savings are measured in the database, not paged into the app

**Finding, recorded whether or not you call it a bug:** the first version of
`computeSwitchSavings` read *every rerouted event the workspace had ever
stored*, 1000 rows at a time, on **every** ingest batch. Its cost grew with the
customer's whole history rather than with the batch, which is the definition of
an unbounded model. It was not a slow query, it was the wrong shape: at 19,124
demo events it already exceeded the two-minute statement budget mid-run, and a
Govern customer at real volume would have hit it in their first week and lost
the accrual write on every batch afterwards.

**Fix, root-caused rather than chunked smaller.** The sum is now done once in
Postgres — `public.switch_savings_basis(_org_id, _switch_ids)` returns one row
per (switch, served pair, original pair) with the event count and the token
totals, and only those few rows are priced in the app. It is arithmetically the
same number: cost is linear in tokens, so summing tokens before pricing and
pricing before summing agree by construction. The recompute also pushes the
switch filter into the query instead of reading the workspace and discarding
most of it.

Measured after the change: 76,496 rerouted events in the demo workspace
aggregate in **171 ms**, and the work is now bounded by the number of distinct
routed pairs (3), not by history length.

**Second-order rule this sets:** any figure recomputed on the ingest path must
be bounded by the batch or by a fixed cardinality. If a calculation needs to
walk history to answer, it belongs in SQL or in a job, never in the request that
reports the traffic.

### Amendment, 10 August 2026 (Dispatch 170) — a "live" dashboard has to actually refresh

Three corrections, one theme: a number that moves is not the same as a number
that was measured.

1. **The banner is now backed by a mechanism.** "Live · streaming from your
   gateway" was shown whenever the newest event was under 3h old, while the
   dashboard query had no polling at all — it re-read the server on mount and
   on window focus, and nothing else. Between those, the only motion on screen
   was `useLiveTotals` extrapolating spend forward at the window's average rate.
   `dashboardQuery` now carries `refetchInterval: 30s`, gated on
   `ingest.state === "live"`, matching the container's real default flush
   interval. Quiet, disconnected and never-connected workspaces do not poll:
   there is nothing to poll for.

2. **Ring denominators are measured, never extrapolated.** Compare's and
   Certify's donuts divided a fixed server numerator by the *ticking*
   `live.spend`, so the percentage drifted downward every 1.8s against spend
   nobody observed. Both now divide by `data.totals.spend`. Compare's "on
   cheapest host" coverage percentage had the same defect and was fixed with
   them. Rightsize and Govern were already measured on both sides.

   **Rule:** the live counter may be *displayed* (its accrual is disclosed), but
   it is never the denominator of a ratio whose numerator is a server figure.

3. **`QUIET_AFTER_HOURS` had a false justification.** The comment claimed "the
   container polls hourly", so 3h was "three missed polls". The flush interval
   is 30s and always has been in shipped config, making 3h roughly 360 missed
   flushes. Re-derived: the threshold tracks *traffic* cadence, not flush
   cadence — a real workspace can legitimately be silent overnight or between
   batch jobs. 3h stays, but on the honest reason, and a tighter number needs a
   distribution of real customer inter-event gaps before it can be defended.

**Residual gap, recorded and not closed.** The ingest → rollup → donut round
trip is still a code trace, not an observed test: no plaintext ingest token was
available, and the only real workspace has been quiet for 99h. To close it, push
a real event with a live token and watch the donut move on the next 30s tick.
Do it as soon as there is a live customer or Robin supplies a token.

## Dispatch 177 — parser coverage, stated honestly

Real-traffic status of the six envelope parsers, as of this dispatch:

| shape | real provider call | parsed | persisted + rolled up + on a dashboard |
| --- | --- | --- | --- |
| openai-compatible | yes (D102) | yes | yes |
| anthropic | yes (D103/176) | yes | yes (D120 Journey 1) |
| gemini (native) | yes (D103/176) | yes | **yes (D177)** — `src/lib/ingest/__tests__/dispatch-177-gemini-journey.integration.test.ts` |
| cohere | no | fixture only | no |
| bedrock | no | fixture only | no |
| tencent | no | fixture only | no |

Cohere, Bedrock and Tencent have **no credential of any kind in this project**
— not production, not sandbox. Their parsers are proven against recorded
envelopes and nothing more, and no wording anywhere may imply otherwise until a
real key exists. The Bedrock line here is about *ingestion*: observing and
certifying Bedrock traffic. It says nothing about the Phase 3 execution
refusal, which stands — SigV4-signed requests are never rewritten.

## Dispatch 236 — remote task classification, and why it is a new image line

### The gap this closes

Local rules classification (Dispatch 232) is honest and structurally partial.
Measured on a 200-item labelled golden set built from Chain Drill Co's own real
traffic, where the true label is known by construction:

| classifier | correct | wrong | abstained |
| --- | --- | --- | --- |
| local rules (v2) | 36.0% | **0.0%** | 64.0% |
| gpt-5-nano | 72.0% | 24.0% | 4.0% |
| **gpt-5-mini** | **96.5%** | 3.5% | 0.0% |

Two whole buckets — `reasoning` and `agentic` — have no lexical signature the
rules can see, so they abstain on them by construction and Certify never runs.

`gpt-5-nano` was rejected on that evidence, not on price. Converting 24% honest
abstentions into 24% confident wrong labels is worse than not building this:
it trades a visible "we don't know" for an invisible wrong certification.

The mislabelling was diagnosed before the conclusion was drawn, in three real
tests: repeated calls on the same prompt (24/24 identical wrong label), shuffled
ordering, and first-third vs last-third. Deterministic, position-independent,
non-converging — a stable model prior, not a cache artifact.

### Real cost, stated not dismissed

At the golden set's mean prompt (463 in / 21 out): **$0.159 per 1,000
classifications**. Short prompts near $0.03, a full 4,000-character window near
$0.29. Small in absolute terms, not free, and it scales with traffic. This
number appears wherever the capability is described.

### Pool width, re-derived for mini

Not inherited from nano's width of 6 — a width is a function of the service time
of the model actually in the loop. Same method, same throughput target:

    peak observed proxy concurrency ....... 10 in flight
    mean proxied duration ................. ~2.0 s
    arrival rate  λ = 10 / 2.0 ............ 5 req/s
    measured gpt-5-mini p90 (40 real) ..... 1.328 s   (p50 954 ms, max 2991 ms)
    width = ceil(λ × p90) ................. 7

Sized on p90, not p50: the pool exists to absorb the slow tail.

Strict tool-constrained decoding was re-verified for mini rather than assumed to
transfer from the nano probe: 40/40 valid, and 5/5 correct through the shipped
endpoint code path.

### Architecture

Off the request path, always. Classification fires after the caller already has
their response; the label attaches by amending the event **still sitting in the
queue** — the same "correct the queued record" pattern `parser_revision`
reprocessing already uses. Flush is 30s, the call is ~1s, so the label lands on
its own event with no second write.

`x-costmyai-task` is therefore **no longer authoritative** for remotely
classified requests. It reports only what is known synchronously — the local
pass — and sets `x-costmyai-task-final: deferred` when a remote pass will run.
The final label lives in stored data only.

Three new `AbstainReason` members — `remote_unavailable`, `remote_timeout`,
`pool_saturated` — reuse every existing downstream refusal path. No new refusal
mechanism was invented. Any failure leaves the event `unknown` at confidence 0,
and the ladder refuses it exactly as it always has.

`classifier_revision` goes to **2** for remotely-labelled events (the local
classifier's value was confirmed as 1 before bumping, not assumed).

### Why v3 and not a v2 rebuild

v2's documented claim is "structural shape only, never meaning". Under remote
classification that claim is false: extracted prompt text leaves the customer's
network. A claim must not stop being true under a moving tag customers already
run — the same reason v1 was frozen when local classification arrived. So:

| line | local | remote | claim |
| --- | --- | --- | --- |
| v1 | absent | absent | no content is read |
| v2 | ON by default | absent | content read in-process; only enums leave |
| v3 | ON by default | ON by default | extracted text may leave, off the request path |

`COSTMYAI_CLASSIFY_REMOTE=false` makes a v3 container behave exactly like v2.
Remote cannot be on while local reading is off — a container that may send text
upstream but may not look at it locally is a posture nobody asked for.

### Why v3 became the quickstart default (Dispatch 237)

The copy-paste tag was `v1` on the reasoning that a stranger should never be
handed a body-reading container by accident. Measured against real traffic that
default was not conservative, it was broken: `v1` labels almost no ordinary chat
traffic, so Certify — the product's central promise — refuses on nearly all of
it. Local rules alone label 36%; local plus remote label 96.5%.

Two things make the move honest rather than a quiet posture change. Tags still
never mutate: `v1` and `v2` stay published, frozen in posture, and anyone
already running either keeps the exact container they agreed to. And the v3
posture is stated at the point of copying — quickstart, README, CONNECT.md and
the privacy page all say plainly that extracted text may leave the network when
local rules abstain, and name both quieter tags and the env-var opt-out. There
were no customers on `v1` to migrate; this changes what a new installer gets,
nothing else.
