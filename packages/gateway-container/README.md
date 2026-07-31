# CostMyAI gateway container — quickstart

The container runs **in your environment**. It sees your provider keys; we never do.
Nothing it sends upstream contains prompts, completions, or credentials — only metadata
(model, host, task hint, token counts, latency, status) and, optionally, the invoiced
totals it reads locally from your providers.

## 1. Get an ingest token

Dashboard → **Settings → Ingest tokens → Generate**. It is shown once, stored hashed,
and can be rotated at any time. A rotated token stops working immediately; the container
keeps queueing locally and tells you exactly what happened.

## 2. Run it

```bash
docker run -d --name costmyai \
  -e COSTMYAI_INGEST_TOKEN=cma_live_xxxxxxxxxxxxxxxxxxxxxxxx \
  -e COSTMYAI_BASE_URL=https://app.costmyai.com \
  -v costmyai-spool:/var/lib/costmyai/spool \
  -p 8787:8787 \
  ghcr.io/costmyai/gateway:latest
```

## 3. Point your SDK at it

```bash
export OPENAI_BASE_URL=http://localhost:8787/openai/v1
export ANTHROPIC_BASE_URL=http://localhost:8787/anthropic
```

Requests pass straight through to the provider with your own key, resolved locally.
Token counts are read off the response. If CostMyAI is unreachable, metadata spools to
disk and drains later — **an outage on our side never touches your inference path**.

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

## 5. Optional: replay existing history

Already have gateway logs? Replay up to 30 days through the same events endpoint;
idempotency keys make the replay safe to run twice.

```bash
docker exec costmyai costmyai replay --since 30d --file ./gateway-log.jsonl
```

## Endpoints the container talks to

| Purpose  | Path                     |
| -------- | ------------------------ |
| Metadata | `/api/public/v1/events`  |
| Billing  | `/api/public/v1/billing` |

Both are versioned (`{"v": 1, ...}`), batched, and idempotent. Paths come from one shared
config constant, asserted against the live routes in CI.
