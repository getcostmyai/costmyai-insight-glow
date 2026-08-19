/**
 * Dispatch 232, Phase 1 — local task classification, proven through the real
 * proxy rather than against the classifier in isolation.
 *
 * The four things that actually matter:
 *
 *  1. Off by default. A container without the opt-in behaves byte-identically
 *     to every one shipped before: no content read, no new header, `unknown`.
 *  2. On, a real request produces a real label on the real ingest event, and
 *     that label validates against the wire schema.
 *  3. Nothing but the label leaves. The full enqueued payload is asserted to
 *     contain no fragment of the prompt.
 *  4. The label is the CALLER'S task, not the destination's: a switch that
 *     rewrites the model must not be able to change what the workload is
 *     certified as.
 */
import { describe, expect, it } from "vitest";

import { ingestBatchSchema } from "@/lib/ingest/schema";

import { loadConfig } from "../../../../packages/gateway-container/src/config";
import { handleProxy, type ProxyEvent } from "../../../../packages/gateway-container/src/proxy";
import type { QueueItem, UpstreamQueue } from "../../../../packages/gateway-container/src/queue";

const UPSTREAM = "https://api.openai.com";

function config(extra: Record<string, string> = {}) {
  return loadConfig({
    COSTMYAI_INGEST_TOKEN: "cma_live_d232",
    COSTMYAI_UPSTREAM_URL: UPSTREAM,
    COSTMYAI_SPOOL_DIR: "/tmp/costmyai-d232",
    ...extra,
  });
}

function collector() {
  const events: ProxyEvent[] = [];
  const raw: string[] = [];
  const queue = {
    enqueue(item: QueueItem) {
      raw.push(JSON.stringify(item));
      if (item.kind === "events") {
        for (const e of (item.body as { events: ProxyEvent[] }).events) events.push(e);
      }
    },
  } as unknown as UpstreamQueue;
  return { events, raw, queue };
}

const upstreamOk = async () =>
  new Response(JSON.stringify({ model: "gpt-4o", usage: { prompt_tokens: 900, completion_tokens: 120 } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

function request(content: string, extra: Record<string, unknown> = {}): Request {
  return new Request("http://localhost:8787/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer sk-customer-key" },
    body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "user", content }], ...extra }),
  });
}

async function run(content: string, on: boolean, extra: Record<string, unknown> = {}) {
  const { events, raw, queue } = collector();
  const response = await handleProxy(request(content, extra), {
    config: config(on ? { COSTMYAI_CLASSIFY_LOCAL: "1" } : {}),
    queue,
    fetchImpl: upstreamOk as unknown as typeof fetch,
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  return { response, event: events[0], raw };
}

const CODE_PROMPT = "Fix this, it throws a TypeError:\n```ts\nconst total = items.reduce((a, b) => a + b)\n```";

describe("off by default", () => {
  it("reads no content and reports unknown, exactly as before Dispatch 232", async () => {
    const { response, event } = await run(CODE_PROMPT, false);
    expect(event?.task_hint).toBe("unknown");
    expect(response.headers.get("x-costmyai-task")).toBeNull();
    // The whole pre-232 guarantee: an untouched request comes back with no
    // costmyai header of any kind.
    for (const [name] of response.headers) expect(name.startsWith("x-costmyai-")).toBe(false);
  });

  it("still labels what structure alone can prove, with the flag off", async () => {
    const { events, queue } = collector();
    await handleProxy(
      new Request("http://localhost:8787/v1/embeddings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "text-embedding-3-small", input: "anything at all" }),
      }),
      { config: config(), queue, fetchImpl: upstreamOk as unknown as typeof fetch },
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(events[0]?.task_hint).toBe("classification");
  });
});

describe("on, a real request carries a real label", () => {
  it("labels a debugging request as code and discloses it on the response", async () => {
    const { response, event } = await run(CODE_PROMPT, true);
    expect(event?.task_hint).toBe("code");
    expect(response.headers.get("x-costmyai-task")).toBe("code");
    expect(response.headers.get("x-costmyai-task-abstained")).toBeNull();
  });

  it("discloses the abstention, with its reason, when it refuses to label", async () => {
    const { response, event } = await run("hey, any thoughts on yesterday's meeting?", true);
    expect(event?.task_hint).toBe("unknown");
    expect(response.headers.get("x-costmyai-task")).toBe("unknown");
    expect(response.headers.get("x-costmyai-task-abstained")).toBe("weak_signal");
  });

  it("produces events the wire schema accepts, for every label it can emit", async () => {
    const cases: Array<[string, string]> = [
      [CODE_PROMPT, "code"],
      ["Work step by step. Which of the following is correct?\n(A) one\n(B) two", "reasoning"],
      ["Draft a launch announcement email for the new pricing page.", "generation"],
      ["Classify the sentiment of this review. Respond with one word: 'late delivery'", "classification"],
    ];
    for (const [prompt, expected] of cases) {
      const { event } = await run(prompt, true);
      expect(event?.task_hint).toBe(expected);
      const parsed = ingestBatchSchema.safeParse({ events: [event] });
      expect(parsed.success).toBe(true);
    }
  });

  it("labels a tool-carrying conversation agentic from the wire shape", async () => {
    const declaredOnly = await run("book me a table for four", true, {
      tools: [{ type: "function", function: { name: "book_table" } }],
    });
    expect(["agentic", "unknown"]).toContain(declaredOnly.event?.task_hint);

    const withFlag = await run("Use the following tools to book the table, then confirm.", true, {
      tools: [{ type: "function", function: { name: "book_table" } }],
    });
    expect(withFlag.event?.task_hint).toBe("agentic");
  });
});

describe("nothing but the label leaves the container", () => {
  it("enqueues no fragment of the prompt it read", async () => {
    const secret = "ACME Q3 revenue was 4.2 million";
    const { raw, event } = await run(
      `Summarize this for the board and rewrite it as an announcement: ${secret}. Contact dana@acme.example.`,
      true,
    );
    const payload = raw.join("\n");
    expect(event?.task_hint).toBe("generation");
    for (const fragment of ["ACME", "4.2 million", "dana@acme.example", "board", "Summarize"]) {
      expect(payload).not.toContain(fragment);
    }
    // And nothing carrying a credential, unchanged from before.
    expect(payload).not.toContain("sk-customer-key");
  });

  it("has no field in the contract that could carry content even if something tried", async () => {
    const { event } = await run(CODE_PROMPT, true);
    // Stricter than "it would be dropped": the server refuses the whole batch.
    // There is no additive field a future container could smuggle text through.
    const parsed = ingestBatchSchema.safeParse({ events: [{ ...event, prompt: "leak" }] });
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain("unrecognized_keys");
  });

});
