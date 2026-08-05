/**
 * Dispatch 103 — the remaining proofs, all of them real.
 *
 * Nothing in this file stands in for the thing it claims to test:
 *  - the no-retry proof calls a REAL hosted provider and counts real sockets;
 *  - the timeout proof points at a REAL blackholed address and waits;
 *  - the spool proof writes to a REAL temp directory under a REAL failing
 *    upstream, repeatedly, and asserts the bound holds every cycle;
 *  - the contract proofs read the REAL README and the REAL settings route off
 *    disk and compare them to the shared constants.
 */
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ingestEventSchema } from "@/lib/ingest/schema";

import {
  BACKFILL_LOOKBACK_DAYS,
  CONTAINER_DEFAULTS as CONTRACT_DEFAULTS,
  containerImageRef,
  dockerRunSnippet,
  PARSE_STATUSES,
  ROLLING_WINDOW_DAYS,
} from "@/lib/ingest/contract";

import {
  CONTAINER_DEFAULTS as CONTAINER_SIDE_DEFAULTS,
  loadConfig,
} from "../../../../packages/gateway-container/src/config";
import { readUsage } from "../../../../packages/gateway-container/src/parse";
import { handleProxy, type ProxyEvent } from "../../../../packages/gateway-container/src/proxy";
import { UpstreamQueue, type QueueItem } from "../../../../packages/gateway-container/src/queue";
import { Spool } from "../../../../packages/gateway-container/src/spool";

const PROVIDER_URL = "https://ai.gateway.lovable.dev";
const PROVIDER_KEY = process.env["LOVABLE_API_KEY"];

function config(overrides: Record<string, string> = {}) {
  return loadConfig({
    COSTMYAI_INGEST_TOKEN: "cma_live_test",
    COSTMYAI_UPSTREAM_URL: PROVIDER_URL,
    COSTMYAI_SPOOL_DIR: "/tmp/costmyai-d103",
    ...overrides,
  });
}

function collector() {
  const events: ProxyEvent[] = [];
  const queue = {
    enqueue(item: QueueItem) {
      for (const e of (item.body as { events: ProxyEvent[] }).events) events.push(e);
    },
  } as unknown as UpstreamQueue;
  return { events, queue };
}

/* ------------------------------------------- 2. the five envelope parsers */

describe("the five envelope parsers, named and each exercised", () => {
  const cases: Array<[string, unknown, { input: number; output: number }]> = [
    [
      "openai",
      { model: "gpt-4o-mini", usage: { prompt_tokens: 11, completion_tokens: 7 } },
      { input: 11, output: 7 },
    ],
    [
      "anthropic",
      { model: "claude-sonnet-4", usage: { input_tokens: 21, output_tokens: 5 } },
      { input: 21, output: 5 },
    ],
    [
      "gemini",
      { modelVersion: "gemini-2.5-flash", usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 4 } },
      { input: 9, output: 4 },
    ],
    [
      "cohere",
      { model: "command-r", meta: { billed_units: { input_tokens: 3, output_tokens: 2 } } },
      { input: 3, output: 2 },
    ],
    [
      "bedrock",
      { model: "amazon.nova-lite", usage: { inputTokens: 30, outputTokens: 6 } },
      { input: 30, output: 6 },
    ],
  ];

  it.each(cases)("shape %s parses its own envelope", (shape, payload, expected) => {
    const reading = readUsage(payload);
    expect(reading.shape).toBe(shape);
    expect(reading.parseStatus).toBe("parsed");
    expect(reading.inputTokens).toBe(expected.input);
    expect(reading.outputTokens).toBe(expected.output);
  });

  it("names exactly five, plus an honest heuristic tier and an honest unknown", () => {
    expect(cases.map(([shape]) => shape)).toEqual(["openai", "anthropic", "gemini", "cohere", "bedrock"]);
    expect(readUsage({ stats: { generation_tokens: 4 } }).shape).toBe("heuristic");
    expect(readUsage({ stats: { generation_tokens: 4 } }).parseStatus).toBe("tokens_only");
    expect(readUsage({ nothing: true }).shape).toBe("unknown");
    expect(readUsage({ nothing: true }).parseStatus).toBe("unparsed");
  });
});

/* --------------------------------- 3. a failed real provider call, no retry */

describe("a failed call to a real provider", () => {
  it.skipIf(!PROVIDER_KEY)("is issued exactly once and never retried", async () => {
    let upstreamCalls = 0;
    const bodiesSeen: string[] = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      upstreamCalls += 1;
      const res = await fetch(url as string, init);
      const text = await res.text();
      bodiesSeen.push(text);
      return new Response(text, { status: res.status, headers: res.headers });
    }) as unknown as typeof fetch;

    const { events, queue } = collector();
    // A real request to a real endpoint that the provider really rejects.
    const request = new Request("http://localhost/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", "Lovable-API-Key": PROVIDER_KEY! },
      body: JSON.stringify({
        model: "definitely/not-a-real-model-costmyai-d103",
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    const response = await handleProxy(request, { config: config(), queue, fetchImpl });
    const passthrough = await response.text();

    expect(upstreamCalls).toBe(1);
    expect(response.status).toBeGreaterThanOrEqual(400);
    // Byte-identical: the provider's own error, not ours.
    expect(passthrough).toBe(bodiesSeen[0]);
    expect(passthrough).not.toContain(PROVIDER_KEY!);
    // The failure is still reported, with identity, rather than vanishing.
    expect(events).toHaveLength(1);
    expect(events[0]!.status).toBe("error");
    expect(events[0]!.model_key).toBe("definitely/not-a-real-model-costmyai-d103");
  }, 60_000);
});

/* ----------------------- 4. the PROVIDER is slow or unreachable, not CostMyAI */

describe("a provider that never answers", () => {
  it("times out with a clear passthrough error instead of hanging", async () => {
    const { events, queue } = collector();
    const startedAt = Date.now();
    // 10.255.255.1 is a blackhole: packets go in, nothing comes back. A real
    // hang, not a stubbed one — the only thing that ends it is our own timeout.
    const response = await handleProxy(
      new Request("http://localhost/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "gpt-4o-mini", messages: [] }),
      }),
      {
        config: config({
          COSTMYAI_UPSTREAM_URL: "http://10.255.255.1:8080",
          COSTMYAI_UPSTREAM_TIMEOUT_MS: "1500",
        }),
        queue,
      },
    );
    const elapsed = Date.now() - startedAt;
    const body = (await response.json()) as { error: { type: string; message: string } };

    expect(response.status).toBe(504);
    expect(body.error.type).toBe("costmyai_upstream_timeout");
    expect(body.error.message).toMatch(/not retried/i);
    expect(elapsed).toBeGreaterThanOrEqual(1_400);
    expect(elapsed).toBeLessThan(20_000);
    expect(events).toHaveLength(1);
    expect(events[0]!.status).toBe("error");
  }, 30_000);

  it("reports a refused connection distinctly, still without retrying", async () => {
    const { events, queue } = collector();
    const response = await handleProxy(
      new Request("http://localhost/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "gpt-4o-mini", messages: [] }),
      }),
      { config: config({ COSTMYAI_UPSTREAM_URL: "http://127.0.0.1:1" }), queue },
    );
    const body = (await response.json()) as { error: { type: string } };
    expect(response.status).toBe(504);
    expect(body.error.type).toBe("costmyai_upstream_unreachable");
    expect(events).toHaveLength(1);
  }, 30_000);
});

/* ------------------------------------------- 5a. contract additions, asserted */

describe("the contract additions are the same constants everywhere", () => {
  it("mirrors CONTAINER_DEFAULTS into the container with no second copy", () => {
    expect(CONTAINER_SIDE_DEFAULTS).toBe(CONTRACT_DEFAULTS);
    const configSource = readFileSync("packages/gateway-container/src/config.ts", "utf8");
    expect(configSource).toContain("src/lib/ingest/contract.js");
    // No literal redefinition of an env var name, a port or an image anywhere
    // in the container outside the shared constant.
    const containerSources = ["index.ts", "proxy.ts", "queue.ts", "spool.ts", "billing-poll.ts"].map(
      (f) => readFileSync(join("packages/gateway-container/src", f), "utf8"),
    );
    for (const source of containerSources) {
      expect(source).not.toMatch(/COSTMYAI_[A-Z_]+\s*=/);
      expect(source).not.toContain("ghcr.io/costmyai");
    }
  });

  it("accepts every parse_status the connector can emit, and nothing else", () => {
    for (const status of PARSE_STATUSES) {
      const parsed = ingestEventSchema.parse({
        model_key: "gpt-4o-mini",
        host: "api.openai.com",
        input_tokens: 1,
        output_tokens: 1,
        parse_status: status,
      });
      expect(parsed.parse_status).toBe(status);
    }
    expect(() =>
      ingestEventSchema.parse({
        model_key: "m",
        host: "h",
        input_tokens: 0,
        output_tokens: 0,
        parse_status: "probably_fine",
      }),
    ).toThrow();
    // An older container that predates the field behaves exactly as before.
    expect(
      ingestEventSchema.parse({ model_key: "m", host: "h", input_tokens: 0, output_tokens: 0 })
        .parse_status,
    ).toBe("parsed");
  });

  it("carries an idempotency_key on every event the proxy emits", async () => {
    const { events, queue } = collector();
    let n = 0;
    await handleProxy(
      new Request("http://localhost/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "gpt-4o-mini", messages: [] }),
      }),
      {
        config: config(),
        queue,
        fetchImpl: (async () =>
          new Response(JSON.stringify({ model: "gpt-4o-mini", usage: { prompt_tokens: 2, completion_tokens: 1 } }), {
            status: 200,
            headers: { "content-type": "application/json" },
          })) as unknown as typeof fetch,
        uuid: () => `d103-${++n}`,
      },
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(events[0]!.idempotency_key).toBe("d103-1");
    expect(ingestEventSchema.parse(events[0]!).idempotency_key).toBe("d103-1");
  });
});

/* ---------------------------- 5b. the backfill promise, one source of truth */

describe("the backfill promise", () => {
  it("is stated in the dashboard from the same constant the planner uses", () => {
    const settings = readFileSync("src/routes/_authenticated/settings.tsx", "utf8");
    expect(settings).toContain("BACKFILL_LOOKBACK_DAYS");
    expect(settings).toContain("ROLLING_WINDOW_DAYS");
    // Never a hardcoded number that can drift away from the planner.
    expect(settings).not.toMatch(/\b30-day (lookback|backfill)\b/);
  });

  it("is the same number in the package README", () => {
    const readme = readFileSync("packages/gateway-container/README.md", "utf8");
    expect(readme).toContain(`${BACKFILL_LOOKBACK_DAYS}-day lookback`);
    expect(BACKFILL_LOOKBACK_DAYS).toBe(30);
    expect(ROLLING_WINDOW_DAYS).toBe(3);
  });
});

/* --------------------- 5c. the spool bound holds under SUSTAINED failure */

describe("the spool under a sustained CostMyAI outage", () => {
  it("stays bounded by item count across many failed cycles, oldest evicted first", async () => {
    const dir = mkdtempSync(join(tmpdir(), "costmyai-d103-spool-"));
    const bounds = { maxItems: 25, maxAgeMs: 7 * 24 * 60 * 60 * 1000 };
    const spool = new Spool(dir, bounds);
    // A real refused endpoint: every flush in this loop genuinely fails.
    const queue = new UpstreamQueue(config({ COSTMYAI_BASE_URL: "http://127.0.0.1:1" }), fetch, 10_000);

    const sizes: number[] = [];
    for (let cycle = 0; cycle < 40; cycle++) {
      queue.enqueue({ kind: "events", body: { events: [{ idempotency_key: `evt-${cycle}` }] } });
      const report = await queue.drain();
      expect(report.sent).toBe(0);
      expect(report.lastError).toBeTruthy();
      sizes.push(spool.persist(queue.snapshot()));
    }

    // Never grew past the bound, on any cycle.
    expect(Math.max(...sizes)).toBeLessThanOrEqual(bounds.maxItems);
    const kept = spool.load();
    expect(kept).toHaveLength(bounds.maxItems);
    const keys = kept.map((i) => (i.body as { events: { idempotency_key: string }[] }).events[0]!.idempotency_key);
    // The 25 newest survived; the 15 oldest were evicted, not the other way round.
    expect(keys[0]).toBe("evt-15");
    expect(keys.at(-1)).toBe("evt-39");
  }, 60_000);

  it("stays bounded by age too, so a week-long outage cannot hoard disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "costmyai-d103-age-"));
    const bounds = { maxItems: 10_000, maxAgeMs: 7 * 24 * 60 * 60 * 1000 };
    const spool = new Spool(dir, bounds);
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    spool.persist([{ kind: "events", body: { events: [{ idempotency_key: "stale" }] } }], eightDaysAgo);
    expect(spool.load()).toHaveLength(0);
  });

  it("is the bound the shipped container actually runs with", () => {
    const c = config();
    expect(c.spoolMaxItems).toBe(10_000);
    expect(c.spoolMaxAgeMs).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

/* ------------------- 5d. settings and README render from the same constants */

describe("one description of how the container is run", () => {
  const snippet = dockerRunSnippet("cma_live_example");

  it("is rendered by the settings page from the shared renderer, not retyped", () => {
    const settings = readFileSync("src/routes/_authenticated/settings.tsx", "utf8");
    expect(settings).toContain("dockerRunSnippet(");
    expect(settings).not.toContain("docker run");
    expect(settings).not.toContain("ghcr.io/");
    for (const name of Object.values(CONTRACT_DEFAULTS.env)) expect(settings).not.toContain(name);
  });

  it("is character-for-character what the README tells a customer to paste", () => {
    const readme = readFileSync("packages/gateway-container/README.md", "utf8");
    const readmeSnippet = /```bash\n(docker run[\s\S]*?)```/.exec(readme)?.[1]?.trim();
    expect(readmeSnippet).toBeTruthy();
    const normalise = (s: string) => s.replace(/COSTMYAI_INGEST_TOKEN=\S+/, "COSTMYAI_INGEST_TOKEN=X");
    expect(normalise(readmeSnippet!)).toBe(normalise(snippet));
    expect(readme).toContain(containerImageRef());
  });
});
