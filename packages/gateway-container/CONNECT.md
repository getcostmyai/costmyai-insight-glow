# Connecting your stack to CostMyAI

For an engineer who has never seen this product. No CostMyAI internals assumed.
Reading time ~5 minutes; deployment ~10.

---

## What you are actually deploying

A small proxy container that sits between your application and your AI provider.

```text
your app  ──►  CostMyAI connector  ──►  api.openai.com / api.anthropic.com / ...
                      │
                      └──► CostMyAI (metadata only, asynchronous, off your request path)
```

The three things that matter before you decide:

1. **It runs in your infrastructure.** We never run it, never reach into it, and it
   opens no inbound connection to us other than an outbound HTTPS POST of metadata.
2. **Your provider key never leaves your environment.** Your application keeps sending
   its own `Authorization` / `x-api-key` header exactly as it does today. The connector
   copies every header to the provider byte for byte and never reads, stores or logs
   credentials. There is no field anywhere in CostMyAI to paste a provider key into —
   by design. If our container were compromised tomorrow, there is no key of yours in it.
3. **What we receive is metadata, never content.** Model, host, endpoint path, a task
   label, token counts, latency, HTTP status. Never prompts, never completions, never
   headers.

   Which task label you get depends on the **image tag**, and nothing else:

   | Tag   | Task labelling                                                                 |
   | ----- | ------------------------------------------------------------------------------ |
   | `:v1` | Coarse, from the request path and model name alone. No request body is read. Chat traffic stays `unknown`, and Certify refuses it. |
   | `:v2` | Also classifies the request text **inside your own container**. Only the resulting label, a confidence number and feature names (e.g. `structure.tool_result`) are ever sent to us. On by default; `COSTMYAI_CLASSIFY_LOCAL=false` turns it off and your setting always wins. |

   Prompt text never leaves your environment on either tag. `:v1` containers do not
   contain the classifier at all — setting the variable there does nothing.


**The only change to your application is one line: the base URL.** No SDK swap, no code
changes, no key rotation.

---

## Before you start

| You need                       | Notes                                                              |
| ------------------------------ | ------------------------------------------------------------------ |
| Your existing provider API key | Stays where it is. You do not give it to us or to the container.   |
| Somewhere to run a container   | Docker host, ECS/Fargate, Cloud Run, Kubernetes, or a laptop for a first test. |
| Outbound HTTPS from that host  | To your provider, and to CostMyAI.                                 |
| A CostMyAI ingest token        | Dashboard → **Settings → Ingest tokens → Generate**. Shown once, stored only as a SHA-256 hash. |
| Docker able to pull public images | `ghcr.io/getcostmyai/gateway:v3` is anonymously pullable — no registry login. |

Place the container **network-close to the code that calls the provider** — same VPC,
same cluster, same host. Every inference call traverses it, so a cross-region hop is
latency you would be adding for no reason.

---

## Step 1 — Get your ingest token

Dashboard → Settings → Ingest tokens → **Generate**. Copy it immediately; it is displayed
exactly once and we cannot show it again. Store it in whatever secret manager you already
use — it is a normal application secret, and it grants only "write usage metadata into
this one workspace". It cannot read your data and it is not a provider credential.

Lost it? Rotate. Rotation mints the new token *before* revoking the old one, so you can
redeploy without dropping traffic.

## Step 2 — Run one container per provider

The container fronts exactly one upstream. Two providers means two containers on two
ports — that is normal and expected.

**OpenAI:**

```bash
docker run -d --name costmyai-openai --restart unless-stopped \
  -e COSTMYAI_INGEST_TOKEN=cma_live_xxxxxxxxxxxxxxxxxxxxxxxx \
  -e COSTMYAI_BASE_URL=https://project--e64eb6e2-38b5-4107-b0fb-2e2b0ab7a1d4.lovable.app \
  -e COSTMYAI_UPSTREAM_URL=https://api.openai.com \
  -v costmyai-openai-spool:/var/lib/costmyai/spool \
  -p 8787:8787 \
  ghcr.io/getcostmyai/gateway:v3
```

**Anthropic** (second container, second port):

```bash
docker run -d --name costmyai-anthropic --restart unless-stopped \
  -e COSTMYAI_INGEST_TOKEN=cma_live_xxxxxxxxxxxxxxxxxxxxxxxx \
  -e COSTMYAI_BASE_URL=https://project--e64eb6e2-38b5-4107-b0fb-2e2b0ab7a1d4.lovable.app \
  -e COSTMYAI_UPSTREAM_URL=https://api.anthropic.com \
  -v costmyai-anthropic-spool:/var/lib/costmyai/spool \
  -p 8788:8787 \
  ghcr.io/getcostmyai/gateway:v3
```

The exact commands with your real token pre-filled are on the Settings page. The dashboard
generates them from the same constant the container itself reads, so they cannot drift.

### Every setting

| Variable                        | Required | Default                 | What it does                              |
| ------------------------------- | -------- | ----------------------- | ----------------------------------------- |
| `COSTMYAI_INGEST_TOKEN`         | yes      | —                       | Your workspace token. Never a provider key. |
| `COSTMYAI_UPSTREAM_URL`         | yes      | —                       | The one provider this container fronts.   |
| `COSTMYAI_BASE_URL`             | no       | our production URL      | Where metadata is delivered.              |
| `COSTMYAI_PORT`                 | no       | `8787`                  | Listen port inside the container.         |
| `COSTMYAI_SPOOL_DIR`            | no       | `/var/lib/costmyai/spool` | Disk queue used when we're unreachable.  |
| `COSTMYAI_FLUSH_INTERVAL_MS`    | no       | `30000`                 | How often metadata is flushed to us.      |
| `COSTMYAI_UPSTREAM_TIMEOUT_MS`  | no       | `120000`                | Wait for provider response headers.       |

Mount the spool volume. Without it, a container restart during a CostMyAI outage loses the
queued metadata (never your inference — that path is unaffected either way).

A missing required variable makes the container **exit immediately with a message naming
it**, rather than starting half-configured.

## Step 3 — Point your SDK at the container

One line. The suffix differs per provider, because each SDK appends its own paths:

| Provider                                        | Set                                                      |
| ----------------------------------------------- | -------------------------------------------------------- |
| OpenAI                                          | `OPENAI_BASE_URL=http://localhost:8787/v1`               |
| Anthropic                                       | `ANTHROPIC_BASE_URL=http://localhost:8788`               |
| Google Gemini                                   | `GOOGLE_GEMINI_BASE_URL=http://localhost:8789`           |
| Groq / Together / Fireworks / Mistral / xAI / vLLM | `OPENAI_BASE_URL=http://localhost:8790/openai/v1`     |

Replace `localhost` with the container's service name / DNS name in a cluster.

Or in code, without touching env:

```python
client = OpenAI(base_url="http://costmyai-openai:8787/v1")   # key unchanged
```

```typescript
const client = new Anthropic({ baseURL: "http://costmyai-anthropic:8787" }); // key unchanged
```

## Step 4 — Verify

```bash
# 1. The container is up and knows its upstream.
curl -s http://localhost:8787/healthz
# {"ok":true,"upstream":"api.openai.com","queued":0,"lastFlushAt":null,"lastError":null}

# 2. A real call through it, with YOUR key, exactly as you'd call the provider.
curl -s http://localhost:8787/v1/chat/completions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "content-type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"ping"}]}'

# 3. Metadata delivered: queued back to 0, lastFlushAt recent, lastError null.
curl -s http://localhost:8787/healthz
```

Then open the CostMyAI dashboard. The call appears within about a minute, with its model,
host, token counts and latency.

---

## What to expect in normal operation

- **Provider errors pass through byte-identically.** A 429, 400 or 401 from your provider
  arrives with the provider's own status, headers and body. The proxy adds nothing.
- **A paid completion is never retried.** Not on timeout, not on 5xx, not on a dropped
  socket — a retried completion can double-execute and bill you twice. Metadata delivery
  to us retries freely; that is idempotent and free.
- **Streaming streams.** Response bytes are piped through as they arrive. Usage is read
  from a bounded 16 KB head and tail window, so a 200 MB response costs 32 KB of memory.
- **A CostMyAI outage never touches your inference.** Metadata spools to disk (bounded:
  10,000 items / 7 days, oldest evicted first) and drains when we're back.
- **Timeouts are bounded, not hangs.** No response headers within
  `COSTMYAI_UPSTREAM_TIMEOUT_MS` returns a 504 naming the timeout.
- **Latency added:** one local network hop and a header copy. Nothing in the request path
  waits on us, takes a lock, or blocks on the metadata queue.

### If your provider isn't one we recognise

The connector reads **response envelopes, not models**, so once a shape is handled, every
model that provider ships is covered the day it ships. Six shapes cover the tracked
providers: OpenAI-compatible, Anthropic, Google, Cohere, Bedrock Converse, Tencent Hunyuan.

Anything else is **still forwarded untouched** — your inference never depends on us
recognising it — and the event is reported honestly as `unparsed` rather than guessed at.
You will see the request, its model, host, latency and status, with no token counts and no
cost attached, and the dashboard says so rather than showing a confident wrong number.

We retain a **content-free structural skeleton** of those responses: keys and numeric
values only, with every string value replaced by `null` before anything leaves your
network, bounded in size. That is enough to re-read the response when the parser ships,
and not enough to reconstruct anything you sent. When we add your shape, your earlier
traffic is reprocessed and the history stops under-reporting. Tell us the provider.

---

## Troubleshooting

| Symptom                                      | Cause                          | Fix                                                                                                        |
| -------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Calls work, nothing on the dashboard          | Wrong or revoked ingest token  | `/healthz` shows `queued` climbing and a 401 in `lastError`. Rotate in Settings, redeploy. Queued metadata drains once accepted — nothing is lost. |
| `502` from the connector                      | Can't reach the provider       | Check egress: `docker exec costmyai-openai wget -qO- https://api.openai.com`. Firewall / proxy / DNS.       |
| `504` from the connector                      | Provider sent no headers in time | Raise `COSTMYAI_UPSTREAM_TIMEOUT_MS`. It is never retried, so you were not double-billed.                 |
| `404` from the provider                       | Wrong SDK base URL             | Check the suffix in the Step 3 table — it differs per provider.                                             |
| Calls hit the wrong provider                  | Wrong `COSTMYAI_UPSTREAM_URL`  | `/healthz` names the upstream it is actually fronting. One container per provider.                          |
| Container exits on start                      | Missing required variable      | `docker logs costmyai-openai` — it names the variable.                                                      |
| `queued` grows and never drains               | Can't reach CostMyAI           | Allow outbound HTTPS to the `COSTMYAI_BASE_URL` host. Inference is unaffected meanwhile.                    |
| `manifest unknown` on `docker pull`           | Wrong image reference          | Exactly `ghcr.io/getcostmyai/gateway:v3`. No login required.                                                |

Anything else: send us `curl -s http://localhost:8787/healthz` and
`docker logs --tail 50 <container>`. Neither contains a credential — every
credential-bearing header is dropped before any diagnostic touches it, on success and
error paths alike.

---

## Optional: billing reconciliation

Mount **read-only** billing credentials to compare what we estimated against what you were
actually invoiced:

```bash
  -e COSTMYAI_BILLING_OPENAI_KEY=sk-admin-...
```

They stay in your container, same as everything else. The first poll after a provider is
connected looks back 30 days, so you see a real reconciled month on day one; every poll
after re-reads only the last 3 days, because invoices settle late but settled invoices
don't change. Captures are idempotent on (org, provider, period start, period end), so a
restart or a re-run cannot double-count a month. This reconciles **invoice totals only** —
connecting today does not retroactively create yesterday's per-model breakdown, and the
dashboard says so.

---

## Moving from `:v1` to `:v2`

`:v2` is the same connector with local task classification on by default, which is what
makes Certify and Rightsize work on ordinary chat traffic. The whole migration:

```bash
docker pull ghcr.io/getcostmyai/gateway:v2
# change the image reference in your run command, compose file or task definition
# recreate the container — keep the same spool volume mount
```

Nothing else on your side changes: same env vars, same port, same ingest token, same
provider keys, same SDK base URLs, no application change. Keep the spool volume and
queued metadata survives the swap. Roll back by pointing the reference at `:v1` and
recreating.

`:v1` never gains this. It is frozen at the image you are already running, and it does
not contain the classifier — setting `COSTMYAI_CLASSIFY_LOCAL` on a `:v1` container does
nothing at all, which is why the upgrade is a new tag rather than a new variable.

Want `:v2` without local classification? `-e COSTMYAI_CLASSIFY_LOCAL=false`. Your setting
overrides the tag's default in both directions.

## Rolling back

Point the base URL back at the provider and restart your app. That's the whole rollback —
nothing about your keys, models or code changed. The container can keep running or be
stopped; either way your inference path is unaffected.


## If a switch does not work out

When a switch sends a request to a destination that refuses it before doing any
work, the container immediately re-sends your original request and marks the
response:

```
x-costmyai-reroute: fell_back
x-costmyai-reroute-fallback: model_not_found
x-costmyai-attempted-model: openai/gpt-4.1-mini
x-costmyai-model: openai/gpt-4o-mini
```

You get your answer, from your own model. Nothing is retried after a server
error or a timeout, because the provider may already have billed that work.

If the same switch falls back three times in an hour, CostMyAI pauses it for
you and tells you why on the switch itself. You can resume it at any time.
