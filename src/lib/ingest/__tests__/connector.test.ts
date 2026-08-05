import { readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { normalizeTask, resolveLadder } from "@/lib/benchmarks/task-ladder";

import { classifyTask, isInScope } from "../../../../packages/gateway-container/src/classify";
import { createGateway } from "../../../../packages/gateway-container/src/index";
import {
  CONTAINER_DEFAULTS,
  containerImageRef,
  dockerRunSnippet,
  loadConfig,
  UNKNOWN_TASK_HINT,
} from "../../../../packages/gateway-container/src/config";
import { readUsage, StreamUsageCollector } from "../../../../packages/gateway-container/src/parse";
import {
  handleProxy,
  modelFromRequest,
  redactHeaders,
  type ProxyEvent,
} from "../../../../packages/gateway-container/src/proxy";
import { UpstreamQueue } from "../../../../packages/gateway-container/src/queue";
import { Spool } from "../../../../packages/gateway-container/src/spool";

const KEY = "sk-super-secret-provider-key-do-not-leak";

function config(overrides: Record<string, string> = {}) {
  return loadConfig({
    COSTMYAI_INGEST_TOKEN: "cma_live_test",
    COSTMYAI_UPSTREAM_URL: "https://api.openai.com",
    COSTMYAI_SPOOL_DIR: "/tmp/costmyai-test",
    ...overrides,
  });
}

function harness(responder: (req: Request) => Promise<Response> | Response) {
  const sent: unknown[] = [];
  const queue = new UpstreamQueue(config(), (async () => new Response("{}")) as unknown as typeof fetch);
  const originalEnqueue = queue.enqueue.bind(queue);
  queue.enqueue = (item) => {
    sent.push(item);
    originalEnqueue(item);
  };
  const seen: Request[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const req = new Request(url, init);
    seen.push(req);
    return responder(req);
  }) as unknown as typeof fetch;
  return {
    sent,
    seen,
    deps: { config: config(), queue, fetchImpl, uuid: () => "fixed-id" },
    events: () => sent.flatMap((s) => (s as { body: { events: ProxyEvent[] } }).body.events),
  };
}

function post(body: unknown, path = "/v1/chat/completions"): Request {
  return new Request(`http://localhost:8787${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/* ------------------------------------------------------------------ shapes */

describe("response envelopes, not models", () => {
  it("reads the OpenAI-compatible shape (OpenAI, Groq, Together, Fireworks, Mistral, vLLM)", () => {
    const r = readUsage({ model: "gpt-4o-mini", usage: { prompt_tokens: 120, completion_tokens: 40 } });
    expect(r).toMatchObject({ inputTokens: 120, outputTokens: 40, shape: "openai", parseStatus: "parsed" });
  });

  it("reads the Anthropic shape", () => {
    const r = readUsage({ model: "claude-sonnet-4", usage: { input_tokens: 900, output_tokens: 15 } });
    expect(r).toMatchObject({ inputTokens: 900, outputTokens: 15, shape: "anthropic", parseStatus: "parsed" });
  });

  it("reads the Gemini shape, and derives output from the total when needed", () => {
    const r = readUsage({
      modelVersion: "gemini-2.0-flash",
      usageMetadata: { promptTokenCount: 100, totalTokenCount: 175 },
    });
    expect(r).toMatchObject({ inputTokens: 100, outputTokens: 75, model: "gemini-2.0-flash", shape: "gemini" });
  });

  it("reads the Cohere billed_units shape", () => {
    const r = readUsage({ model: "command-r", meta: { billed_units: { input_tokens: 10, output_tokens: 3 } } });
    expect(r).toMatchObject({ inputTokens: 10, outputTokens: 3, shape: "cohere", parseStatus: "parsed" });
  });

  it("reads the Bedrock Converse camelCase shape", () => {
    const r = readUsage({ usage: { inputTokens: 7, outputTokens: 2, totalTokens: 9 } });
    expect(r).toMatchObject({ inputTokens: 7, outputTokens: 2, shape: "bedrock" });
  });

  it("marks an unrecognised envelope with recognisable counters tokens_only, not parsed", () => {
    const r = readUsage({ result: { stats: { prompt_eval_count: 30, eval_count: 9 } } });
    expect(r).toMatchObject({ inputTokens: 30, outputTokens: 9, parseStatus: "tokens_only", shape: "heuristic" });
  });

  it("reports unparsed rather than inventing zeroes it cannot justify", () => {
    expect(readUsage({ id: "resp_1", output: "..." }).parseStatus).toBe("unparsed");
  });
});

describe("streaming", () => {
  it("reads OpenAI's final usage chunk out of an SSE stream", () => {
    const c = new StreamUsageCollector();
    c.feed('data: {"choices":[{"delta":{"content":"he"}}]}\n\n');
    c.feed('data: {"choices":[{"delta":{"content":"llo"}}]}\n\n');
    c.feed('data: {"model":"gpt-4o","usage":{"prompt_tokens":11,"completion_tokens":4}}\n\ndata: [DONE]\n\n');
    expect(c.finish()).toMatchObject({ inputTokens: 11, outputTokens: 4, parseStatus: "parsed" });
  });

  it("combines Anthropic's message_start input with its message_delta output", () => {
    const c = new StreamUsageCollector();
    c.feed('event: message_start\ndata: {"message":{"usage":{"input_tokens":2000,"output_tokens":1}}}\n\n');
    for (let i = 0; i < 200; i++) c.feed(`data: {"delta":{"text":"chunk ${i}"}}\n\n`);
    c.feed('event: message_delta\ndata: {"usage":{"output_tokens":312}}\n\n');
    const r = c.finish();
    expect(r.inputTokens).toBe(2000);
    expect(r.outputTokens).toBe(312);
  });

  it("holds bounded memory on a huge stream instead of buffering it", () => {
    const c = new StreamUsageCollector();
    const megabyte = "x".repeat(1024 * 1024);
    for (let i = 0; i < 20; i++) c.feed(`data: {"delta":"${megabyte}"}\n\n`);
    c.feed('data: {"usage":{"prompt_tokens":5,"completion_tokens":6}}\n\n');
    // 20MB fed; two 16KB windows retained.
    expect(c.finish()).toMatchObject({ inputTokens: 5, outputTokens: 6 });
  });
});

/* ------------------------------------------------------- credentials/proxy */

describe("the customer's provider key", () => {
  it("is forwarded byte-for-byte and never rewritten", async () => {
    const h = harness(() => new Response(JSON.stringify({ usage: { prompt_tokens: 1, completion_tokens: 1 } })));
    await handleProxy(post({ model: "gpt-4o" }), h.deps);
    expect(h.seen[0]!.headers.get("authorization")).toBe(`Bearer ${KEY}`);
  });

  it("never appears in any diagnostic output", () => {
    const headers = new Headers({ authorization: `Bearer ${KEY}`, "x-api-key": KEY, "content-type": "application/json" });
    const redacted = JSON.stringify(redactHeaders(headers));
    expect(redacted).not.toContain(KEY);
    expect(redacted).toContain("[redacted]");
    expect(redacted).toContain("application/json");
  });

  it("never appears in the metadata sent to CostMyAI", async () => {
    const h = harness(() => new Response(JSON.stringify({ usage: { prompt_tokens: 1, completion_tokens: 1 } })));
    await handleProxy(post({ model: "gpt-4o", messages: [{ role: "user", content: "secret prompt" }] }), h.deps);
    await new Promise((r) => setTimeout(r, 10));
    const payload = JSON.stringify(h.sent);
    expect(payload).not.toContain(KEY);
    expect(payload).not.toContain("secret prompt");
  });
});

describe("the proxied call", () => {
  it("is never retried, even on a 500", async () => {
    let calls = 0;
    const h = harness(() => {
      calls++;
      return new Response("upstream exploded", { status: 500 });
    });
    const res = await handleProxy(post({ model: "gpt-4o" }), h.deps);
    expect(calls).toBe(1);
    expect(res.status).toBe(500);
  });

  it("passes a provider error through byte-identically", async () => {
    const body = JSON.stringify({ error: { message: "Rate limit reached", type: "rate_limit_error" } });
    const h = harness(
      () => new Response(body, { status: 429, headers: { "retry-after": "17", "content-type": "application/json" } }),
    );
    const res = await handleProxy(post({ model: "gpt-4o" }), h.deps);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("17");
    expect(await res.text()).toBe(body);
  });

  it("records a failed call as an error event with zero output tokens", async () => {
    const h = harness(() => new Response("nope", { status: 400 }));
    await handleProxy(post({ model: "gpt-4o" }), h.deps);
    await new Promise((r) => setTimeout(r, 10));
    expect(h.events()[0]).toMatchObject({ status: "error", output_tokens: 0, model_key: "gpt-4o" });
  });

  it("times out instead of hanging, and says it did not retry", async () => {
    const h = harness(() => new Response("unused"));
    const hangingFetch = (async (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      })) as unknown as typeof fetch;
    const deps = {
      ...h.deps,
      fetchImpl: hangingFetch,
      config: config({ COSTMYAI_UPSTREAM_TIMEOUT_MS: "10" }),
    };
    const res = await handleProxy(post({ model: "gpt-4o" }), deps);
    expect(res.status).toBe(504);
    expect(await res.text()).toMatch(/not retried/i);
  });

  it("serves concurrent requests without serialising on the queue", async () => {
    const h = harness(async () => {
      await new Promise((r) => setTimeout(r, 20));
      return new Response(JSON.stringify({ usage: { prompt_tokens: 1, completion_tokens: 1 } }));
    });
    const started = Date.now();
    await Promise.all(Array.from({ length: 25 }, () => handleProxy(post({ model: "gpt-4o" }), h.deps)));
    // 25 sequential 20ms calls would be 500ms; concurrent is a fraction of that.
    expect(Date.now() - started).toBeLessThan(250);
  });
});

describe("what ends up in an event", () => {
  it("identifies the model from the request body", () => {
    expect(modelFromRequest(new TextEncoder().encode('{"model":"claude-sonnet-4"}'), "/v1/messages")).toBe(
      "claude-sonnet-4",
    );
  });

  it("identifies the model from the path where the provider puts it there", () => {
    expect(modelFromRequest(undefined, "/v1beta/models/gemini-2.0-flash:generateContent")).toBe("gemini-2.0-flash");
  });

  it("reports an unidentifiable model rather than dropping the event", async () => {
    const h = harness(() => new Response("{}"));
    await handleProxy(post({ messages: [] }), h.deps);
    await new Promise((r) => setTimeout(r, 10));
    expect(h.events()[0]).toMatchObject({ model_key: "unknown", parse_status: "unparsed" });
  });

  it("derives no metadata for out-of-scope paths, but still forwards them", async () => {
    const h = harness(() => new Response(JSON.stringify({ id: "batch_1" })));
    const res = await handleProxy(post({ input_file_id: "f" }, "/v1/batches"), h.deps);
    expect(res.status).toBe(200);
    expect(h.sent).toHaveLength(0);
  });
});

describe("task classification", () => {
  it("labels embeddings from the path alone", () => {
    expect(classifyTask("/v1/embeddings", "text-embedding-3-small")).toBe("classification");
  });

  it("labels a code model from its name", () => {
    expect(classifyTask("/v1/chat/completions", "codestral-latest")).toBe("code");
  });

  it("refuses to guess a general chat call — unknown, never a fabricated label", () => {
    expect(classifyTask("/v1/chat/completions", "gpt-4o")).toBe("unknown");
    expect(classifyTask("/v1/messages", "claude-sonnet-4")).toBe("unknown");
  });

  it("keeps batch and fine-tuning out of scope", () => {
    expect(isInScope("/v1/chat/completions")).toBe(true);
    expect(isInScope("/v1/batches")).toBe(false);
    expect(isInScope("/v1/fine_tuning/jobs")).toBe(false);
  });
});

/* -------------------------------------------------------------- durability */

describe("the spool", () => {
  it("survives a restart", () => {
    const dir = mkdtempSync(join(tmpdir(), "costmyai-spool-"));
    const spool = new Spool(dir, { maxItems: 100, maxAgeMs: 60_000 });
    spool.persist([{ kind: "events", body: { events: [1] } }]);
    expect(new Spool(dir, { maxItems: 100, maxAgeMs: 60_000 }).load()).toHaveLength(1);
  });

  it("is bounded by count — an outage costs the oldest metadata, never the disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "costmyai-spool-"));
    const spool = new Spool(dir, { maxItems: 5, maxAgeMs: 60_000 });
    const written = spool.persist(
      Array.from({ length: 50 }, (_, i) => ({ kind: "events" as const, body: { events: [i] } })),
    );
    expect(written).toBe(5);
    expect(spool.load()).toHaveLength(5);
  });

  it("is bounded by age", () => {
    const dir = mkdtempSync(join(tmpdir(), "costmyai-spool-"));
    const spool = new Spool(dir, { maxItems: 100, maxAgeMs: 1_000 });
    spool.persist([{ kind: "events", body: { events: [1] } }], Date.now() - 10_000);
    expect(spool.load()).toHaveLength(0);
  });
});

/* ------------------------------------------------------- one documented run */

describe("one description of how the container is run", () => {
  const snippet = dockerRunSnippet("cma_live_example");

  it("is what the package README tells a customer to paste", () => {
    const readme = readFileSync("packages/gateway-container/README.md", "utf8");
    expect(readme).toContain(containerImageRef());
    expect(readme).toContain(`-p ${CONTAINER_DEFAULTS.port}:${CONTAINER_DEFAULTS.port}`);
    for (const name of Object.values(CONTAINER_DEFAULTS.env).slice(0, 3)) expect(readme).toContain(name);
  });

  it("is what the dashboard quickstart renders", () => {
    const settings = readFileSync("src/routes/_authenticated/settings.tsx", "utf8");
    expect(settings).toContain("dockerRunSnippet(");
    expect(settings).not.toMatch(/costmyai\/gateway:latest|COSTMYAI_ENDPOINT|8080:8080/);
  });

  it("names the upstream, because one container fronts one provider", () => {
    expect(snippet).toContain(`${CONTAINER_DEFAULTS.env.upstream}=`);
    expect(() =>
      loadConfig({ COSTMYAI_INGEST_TOKEN: "cma_live_test" }),
    ).toThrow(/COSTMYAI_UPSTREAM_URL/);
  });
});

/* ------------------------------------------------ unlabelled work refuses */

describe("an unlabelled cohort", () => {
  it("refuses certification instead of borrowing an unrelated instrument", () => {
    const r = resolveLadder(UNKNOWN_TASK_HINT, () => 99);
    expect(r.field).toBeNull();
    expect(r.refusal).toBe("no_valid_instrument");
    expect(r.detail).toMatch(/without a task label/i);
    expect(r.detail).toMatch(/never your prompts/i);
  });

  it("is never normalised into a real task", () => {
    expect(normalizeTask("unknown")).toBeNull();
    expect(normalizeTask("generation")).toBe("generation");
    expect(normalizeTask("code")).toBe("coding");
  });
});

/* ---------------------------------------------- retry / restart integrity */

describe("a retried push", () => {
  it("resends a byte-identical body, so the server dedupes it", async () => {
    let attempt = 0;
    const bodies: string[] = [];
    const queue = new UpstreamQueue(config(), (async (_url: string, init: RequestInit) => {
      bodies.push(String(init.body));
      attempt++;
      return attempt === 1 ? new Response("nope", { status: 503 }) : new Response("{}", { status: 200 });
    }) as unknown as typeof fetch);

    const event = { model_key: "gpt-4o", host: "api.openai.com", idempotency_key: "evt-1" };
    queue.enqueue({ kind: "events", body: { events: [event] } });

    expect((await queue.drain()).sent).toBe(0);
    expect((await queue.drain()).sent).toBe(1);
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toBe(bodies[1]);
    expect(JSON.parse(bodies[1]!).events[0].idempotency_key).toBe("evt-1");
  });

  it("keeps the same key across a restart, so a reloaded spool cannot double-count", () => {
    const dir = mkdtempSync(join(tmpdir(), "costmyai-spool-"));
    const bounds = { maxItems: 100, maxAgeMs: 60_000 };
    const item = { kind: "events" as const, body: { events: [{ idempotency_key: "evt-2" }] } };
    new Spool(dir, bounds).persist([item]);
    expect(new Spool(dir, bounds).load()).toEqual([item]);
  });
});

describe("shutdown", () => {
  it("flushes what is queued before the process exits", async () => {
    const dir = mkdtempSync(join(tmpdir(), "costmyai-shutdown-"));
    const seen: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      seen.push(String(url));
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    try {
      const gateway = createGateway(config({ COSTMYAI_SPOOL_DIR: dir }));
      gateway.queue.enqueue({ kind: "events", body: { events: [{ idempotency_key: "evt-3" }] } });
      await gateway.shutdown("SIGTERM");
      expect(seen).toHaveLength(1);
      expect(gateway.queue.size).toBe(0);
      // Nothing left on disk: the flush happened, it was not just persisted.
      expect(new Spool(dir, { maxItems: 10, maxAgeMs: 60_000 }).load()).toHaveLength(0);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
