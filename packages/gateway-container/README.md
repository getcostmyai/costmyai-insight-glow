# CostMyAI gateway container — quickstart

The container runs **in your environment**. It sees your provider keys; we never do.
Your application keeps sending its own `Authorization` header — the container copies it
through byte for byte and never reads, stores or logs it. Nothing it sends upstream
contains prompts, completions, or credentials — only metadata (model, host, task hint,
token counts, latency, status) and, optionally, the invoiced totals it reads locally
from your providers.

**Handing this to an engineer who has never seen CostMyAI? Give them `CONNECT.md`** — the
complete step-by-step deployment guide, with verification and troubleshooting. This file is
the short version.

Read `DECISIONS.md` for the guarantees behind that sentence — pass-through keys, no
retry of a paid completion, byte-identical provider errors, bounded spool.

## 1. Get an ingest token

Dashboard → **Settings → Ingest tokens → Generate**. It is shown once, stored hashed,
and can be rotated at any time. A rotated token stops working immediately; the container
keeps queueing locally and tells you exactly what happened.

## 2. Run it

One container per provider — `COSTMYAI_UPSTREAM_URL` names the upstream it fronts.

```bash
docker run -d --name costmyai --restart unless-stopped \
  -e COSTMYAI_INGEST_TOKEN=cma_live_xxxxxxxxxxxxxxxxxxxxxxxx \
  -e COSTMYAI_BASE_URL=https://www.costmyai.com \
  -e COSTMYAI_UPSTREAM_URL=https://api.openai.com \
  -v costmyai-spool:/var/lib/costmyai/spool \
  -p 8787:8787 \
  ghcr.io/getcostmyai/gateway:v3
```

The default tag is `v3`: it labels the *kind* of work each request is (coding, reasoning,
agentic and so on) so Certify and Rightsize can act on ordinary chat traffic. Local rules
run in your container, and **nothing leaves the container by default**. The one capability
`v3` adds over `v2` — sending extracted request text to us for labelling when the local
rules abstain — is off unless you explicitly set `-e COSTMYAI_CLASSIFY_REMOTE=true`. Two
quieter tags stay published and are reached by naming them: `:v2` classifies locally only,
nothing leaves your container; `:v1` reads no request body at all. See the posture table
below.

For Anthropic, run a second one with `COSTMYAI_UPSTREAM_URL=https://api.anthropic.com`
and `-p 8788:8787`.

## 3. Point your SDK at it

The suffix differs per provider, because each SDK appends its own paths — an Anthropic
client pointed at a base ending in `/v1` gets a 404 from Anthropic that reads like a
broken proxy.

```bash
export OPENAI_BASE_URL=http://localhost:8787/v1     # container fronting api.openai.com
export ANTHROPIC_BASE_URL=http://localhost:8788     # container fronting api.anthropic.com
```


Your key stays exactly where it is. Requests pass straight through with your own
credentials; token counts are read off the response envelope. If CostMyAI is
unreachable, metadata spools to disk and drains later — **an outage on our side never
touches your inference path**.

`GET /healthz` reports queue depth, last successful flush and last error.

## What it understands

Envelopes, not models — so every model a provider ships is covered the day it ships:

| Shape                | Covers                                                                       |
| -------------------- | ---------------------------------------------------------------------------- |
| OpenAI-compatible    | OpenAI, Azure OpenAI, Groq, Together, Fireworks, DeepInfra, Mistral, xAI, vLLM |
| Anthropic            | Anthropic native, Anthropic on Bedrock/Vertex                                 |
| Google               | Gemini `generateContent`, Vertex AI                                           |
| Cohere               | `meta.billed_units`                                                           |
| Bedrock Converse     | camelCase `inputTokens` / `outputTokens`                                      |
| Tencent Hunyuan      | PascalCase `Usage.PromptTokens` / `CompletionTokens` (TC3)                    |

Streaming is supported for all of them, without buffering the response. Anything else
is still forwarded untouched and reported honestly as `parse_status: "unparsed"` rather
than silently dropped or guessed at.

### Task labels, and the two release lines

On **`:v1`** (the tag above) labels are derived from the request path and model name
only — never from your content. Ordinary chat traffic cannot be placed that way, so it
is reported `unknown`, and an unknown cohort refuses certification instead of borrowing
an unrelated benchmark. That means Certify and Rightsize stay empty for chat workloads.

On **`:v2`** the container additionally classifies the request **inside your own
container** to derive that label. Prompt text is read in your process and never spooled,
logged, retained or sent to us — only the resulting label, a confidence number and
feature names like `code.fenced_block` leave. This is on by default on `v2` and off on
`v1`.

On **`:v3`** the container *can* go one step further, and this is the only mode in which
anything you sent could reach us — but it does not do so unless you opt in with
`-e COSTMYAI_CLASSIFY_REMOTE=true`. With that set, when the in-container rules **cannot**
place a request — which is most ordinary reasoning and agentic traffic — the extracted
request text is sent to CostMyAI and labelled by a model. That call happens **after your
response has already been returned**: it never sits in front of your traffic, adds nothing
to your latency, and an outage of it is invisible to your callers. It costs roughly
**$0.16 per 1,000 classified requests** in model spend, which we absorb; short prompts are
nearer $0.03 and long ones nearer $0.29. Left unset, `v3` behaves exactly like `v2`.

The reason this is a separate tag rather than an update to `v2` is that `v2` promises your
text never leaves your network, and under `v3` that promise would no longer be true. We do
not change what a promise means under a tag you are already running.

| tag | reads your content | sends anything derived from it | sends the text itself |
| --- | --- | --- | --- |
| `:v1` | no | path + model name only | no |
| `:v2` | in your container | label, confidence, feature names | no |
| `:v3` | in your container | label, confidence, feature names | **only if you opt in — `COSTMYAI_CLASSIFY_REMOTE=true` — and then only when the local rules abstain** |

Remote classification is off by default; `-e COSTMYAI_CLASSIFY_REMOTE=true` opts in, and
without it a `v3` image behaves exactly like `v2`.

**Moving from v1 to v2 — the whole migration:**

```bash
docker pull ghcr.io/getcostmyai/gateway:v2
# change the image reference in your run command / compose file / task definition
# then recreate the container
```

Nothing else changes. Same env vars, same port, same spool volume (keep the mount —
queued metadata survives the swap), same ingest token, same base URLs in your SDKs, same
provider keys. Your application is not touched at all. Roll back by pointing the image
reference at `:v1` and recreating.

Want `v2` without local classification — newer image, `v1` posture? Add
`-e COSTMYAI_CLASSIFY_LOCAL=false`. Your setting always wins over the tag's default.
Responses from a classifying container carry `x-costmyai-task` (and
`x-costmyai-task-abstained` when it declined to label), so you can see per request
exactly what was derived.

One caveat on that header, stated plainly: on `v3` with remote classification opted in, it
reports **only what was known at the moment your response was sent** — the local pass.
Remote classification finishes about a second later, so a request that is labelled
remotely leaves the header reading `unknown` with `x-costmyai-task-final: deferred`
alongside it. The final label exists only in your stored data on the dashboard, never in
the response header.


## 4. Optional: billing reconciliation

Mount read-only billing credentials into the container to compare what we estimated
against what you were actually invoiced:

```bash
  -e COSTMYAI_BILLING_OPENAI_KEY=sk-admin-...
```

The **first poll after a provider is connected uses a 30-day lookback**, so you see a
real reconciled month on day one instead of waiting for it to accumulate. Every poll
after that uses the short rolling window. Captures are idempotent on
`(org, provider, period_start, period_end)` — a restart, a reconnect, or a re-run of the
backfill cannot double-count a month. If a provider exposes less than 30 days of invoice
history, the shortfall appears as a coverage note in the dashboard rather than a silently
short window.

Note that this reconciles **invoice totals**, not per-request history: connecting today
does not retroactively create yesterday's per-model breakdown, and the dashboard says so.

## Endpoints the container talks to

| Purpose  | Path                     |
| -------- | ------------------------ |
| Metadata | `/api/public/v1/events`  |
| Billing  | `/api/public/v1/billing` |

Both are versioned (`{"v": 1, ...}`), batched, and idempotent. Paths, port, image name
and env var names come from one shared config constant, asserted against the live routes
and against the dashboard's quickstart in CI.

## Publishing the image (maintainers)

The reference customers paste — `ghcr.io/getcostmyai/gateway:v3` (Dispatch 237; `v1` and
`v2` remain published and are reached by naming them) — is generated from
`CONTAINER_DEFAULTS` in `src/lib/ingest/contract.ts`. Publishing does not change any
code; it makes that existing reference resolve. `bun run audit` fails until it does.

**Registry:** GitHub Container Registry, under the CostMyAI GitHub org. Anonymous pull
must work — a customer running `docker run` has no CostMyAI credentials at that point.

**Tags, all three from one build:**

| Tag       | Purpose                                                              |
| --------- | -------------------------------------------------------------------- |
| `v1.0.0`  | immutable release, matches `packages/gateway-container/package.json` |
| `v1`      | moving pointer — the tag the quickstart names                        |
| `sha-...` | the exact commit the image was built from                            |

### Preferred: publish from GitHub Actions (no local Docker)

`.github/workflows/publish-gateway.yml` builds and pushes all three tags on GitHub's
runners, authenticating with the built-in `GITHUB_TOKEN` — no PAT, no local Docker.

1. GitHub → **Actions** → **Publish gateway container** → **Run workflow**.
2. Leave `version` at `v1.0.0` (or set the release tag being cut) → **Run workflow**.
3. When it goes green, flip the package to public **once**:
   github.com/orgs/getcostmyai/packages → `gateway` → Package settings →
   Change visibility → **Public**. A GHCR package created by a workflow is
   **private by default** — pushing does not make it pullable by strangers.
4. Back in the repo: `bun scripts/audit/image-published.ts`.

### Alternative: publish from a local Docker daemon

Run from a clean checkout of the commit being released, at the repository root:


```bash
# 0. Confirm you are releasing what you think you are.
git status --porcelain            # must be empty
git rev-parse --short HEAD

VERSION=v1.0.0
SHA=sha-$(git rev-parse --short HEAD)
IMAGE=ghcr.io/getcostmyai/gateway

# 1. Build from the real current source. Context is the repository root: the
#    container compiles src/lib/ingest/contract.ts into itself.
docker build -f packages/gateway-container/Dockerfile \
  -t $IMAGE:$VERSION -t $IMAGE:v1 -t $IMAGE:$SHA .

# 2. Log in. Credential: a GitHub personal access token (classic) belonging to
#    an account with write access to the getcostmyai org, with scopes
#    write:packages and read:packages. A fine-grained token does not work for
#    GHCR. Never a password.
echo $GHCR_TOKEN | docker login ghcr.io -u <github-username> --password-stdin

# 3. Push all three tags.
docker push $IMAGE:$VERSION
docker push $IMAGE:v1
docker push $IMAGE:$SHA

# 4. Make the package public — required, and NOT done by the push.
#    github.com/orgs/getcostmyai/packages -> gateway -> Package settings ->
#    Change visibility -> Public.
```

**Verify it is genuinely public**, not just sitting in your local cache. Either on a
second machine, or locally after evicting the local copy:

```bash
docker logout ghcr.io
docker image rm $IMAGE:v1 $IMAGE:$VERSION $IMAGE:$SHA
docker pull ghcr.io/getcostmyai/gateway:v3
docker run --rm ghcr.io/getcostmyai/gateway:v3 --version 2>/dev/null || true
```

A pull that succeeds while logged out is the only proof that a stranger can run the
quickstart. Then, from the repo:

```bash
bun scripts/audit/image-published.ts
```

which asks the registry anonymously for both `v1` and the pinned release tag, and is
part of `bun run audit`.
