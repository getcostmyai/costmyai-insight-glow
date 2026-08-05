# CostMyAI gateway container — quickstart

The container runs **in your environment**. It sees your provider keys; we never do.
Your application keeps sending its own `Authorization` header — the container copies it
through byte for byte and never reads, stores or logs it. Nothing it sends upstream
contains prompts, completions, or credentials — only metadata (model, host, task hint,
token counts, latency, status) and, optionally, the invoiced totals it reads locally
from your providers.

Read `DECISIONS.md` for the guarantees behind that sentence — pass-through keys, no
retry of a paid completion, byte-identical provider errors, bounded spool.

## 1. Get an ingest token

Dashboard → **Settings → Ingest tokens → Generate**. It is shown once, stored hashed,
and can be rotated at any time. A rotated token stops working immediately; the container
keeps queueing locally and tells you exactly what happened.

## 2. Run it

One container per provider — `COSTMYAI_UPSTREAM_URL` names the upstream it fronts.

```bash
docker run -d --name costmyai \
  -e COSTMYAI_INGEST_TOKEN=cma_live_xxxxxxxxxxxxxxxxxxxxxxxx \
  -e COSTMYAI_BASE_URL=https://app.costmyai.com \
  -e COSTMYAI_UPSTREAM_URL=https://api.openai.com \
  -v costmyai-spool:/var/lib/costmyai/spool \
  -p 8787:8787 \
  ghcr.io/costmyai/gateway:v1
```

For Anthropic, run a second one with `COSTMYAI_UPSTREAM_URL=https://api.anthropic.com`
on another port.

## 3. Point your SDK at it

```bash
export OPENAI_BASE_URL=http://localhost:8787/v1
export ANTHROPIC_BASE_URL=http://localhost:8787
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

Streaming is supported for all of them, without buffering the response. Anything else
is still forwarded untouched and reported honestly as `parse_status: "unparsed"` rather
than silently dropped or guessed at.

Task labels are derived from the request path and model name only — never from your
content. What cannot be placed structurally is reported `unknown`, and an unknown
cohort refuses certification instead of borrowing an unrelated benchmark.

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
