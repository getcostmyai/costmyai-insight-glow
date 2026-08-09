/**
 * Dispatch 155, Stage 5 — the fallback policy, proven condition by condition.
 *
 * Rerouting can now fail in a way CostMyAI caused, so the policy is tested as
 * a closed set rather than as a happy path:
 *
 *  1. Exactly four deterministic, pre-billing conditions fall back.
 *  2. A 5xx and a timeout explicitly do NOT — the destination may already have
 *     generated, and may already have billed, what it produced.
 *  3. Strictly pre-first-byte: a stream that dies after the caller has bytes is
 *     never retried, which is the invariant that stops double-billing.
 *  4. Every fallback discloses itself on the caller's response AND emits a real
 *     event AND reports itself to the control plane.
 */
import { describe, expect, it } from "vitest";

import { ingestBatchSchema } from "@/lib/ingest/schema";
import type { SwitchPlan, SwitchPlanEntry } from "@/lib/ingest/switch-plan";

import { loadConfig } from "../../../../packages/gateway-container/src/config";
import {
  classifyResponseFailure,
  classifyTransportFailure,
} from "../../../../packages/gateway-container/src/fallback";
import { handleProxy, type ProxyEvent } from "../../../../packages/gateway-container/src/proxy";
import type { QueueItem, UpstreamQueue } from "../../../../packages/gateway-container/src/queue";
import { SwitchMap } from "../../../../packages/gateway-container/src/switch-map";

const UPSTREAM = "https://api.openai.com";
const SWITCH_ID = "11111111-2222-4333-8444-666666666666";

function config(extra: Record<string, string> = {}) {
  return loadConfig({
    COSTMYAI_INGEST_TOKEN: "cma_live_stage5",
    COSTMYAI_UPSTREAM_URL: UPSTREAM,
    COSTMYAI_SPOOL_DIR: "/tmp/costmyai-d155-stage5",
    ...extra,
  });
}

function collector() {
  const events: ProxyEvent[] = [];
  const fallbacks: Array<Record<string, unknown>> = [];
  const queue = {
    enqueue(item: QueueItem) {
      if (item.kind === "events") {
        for (const e of (item.body as { events: ProxyEvent[] }).events) events.push(e);
      } else if (item.kind === "fallbacks") {
        for (const f of (item.body as { fallbacks: Array<Record<string, unknown>> }).fallbacks) {
          fallbacks.push(f);
        }
      }
    },
  } as unknown as UpstreamQueue;
  return { events, fallbacks, queue };
}

function entry(overrides: Partial<SwitchPlanEntry> = {}): SwitchPlanEntry {
  return {
    id: SWITCH_ID,
    phase: 1,
    match: { model_keys: ["gpt-4o"], hosts: ["api.openai.com", "openai"] },
    target: { model_key: "gpt-4o-mini", host: "api.openai.com" },
    gate: "connected",
    executable: true,
    needs_confirmation: false,
    ...overrides,
  };
}

async function mapWith(entries: SwitchPlanEntry[]): Promise<SwitchMap> {
  const plan: SwitchPlan = {
    v: 1,
    org_id: "org-stage5",
    generated_at: new Date().toISOString(),
    poll_interval_ms: 60_000,
    switches: entries,
  };
  const map = new SwitchMap(config(), (async () =>
    new Response(JSON.stringify(plan), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch);
  expect(await map.refresh()).toBe(true);
  return map;
}

const CALLER_BODY = JSON.stringify({
  model: "gpt-4o",
  messages: [{ role: "user", content: "hello" }],
});

function callerRequest(): Request {
  return new Request(`http://localhost:8787/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer sk-customer-key" },
    body: CALLER_BODY,
  });
}

/** An upstream that answers each attempt from a scripted list, recording bodies. */
function scripted(responses: Array<() => Response | Promise<Response>>) {
  const bodies: string[] = [];
  const fetchImpl = (async (_url: string | URL, init: RequestInit) => {
    const raw = init.body as Uint8Array | undefined;
    bodies.push(raw ? new TextDecoder().decode(raw) : "");
    const next = responses[Math.min(bodies.length - 1, responses.length - 1)]!;
    return next();
  }) as unknown as typeof fetch;
  return { bodies, fetchImpl };
}

const settle = () => new Promise((r) => setTimeout(r, 30));

const ok = () =>
  new Response(JSON.stringify({ model: "gpt-4o", usage: { prompt_tokens: 5, completion_tokens: 2 } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

/* ------------------------------------------------------- 1. the closed set */

describe("only four deterministic, pre-billing conditions are fallback conditions", () => {
  it("classifies the four that are", () => {
    expect(classifyTransportFailure(false)).toBe("connection_error");
    expect(
      classifyResponseFailure(404, JSON.stringify({ error: { message: "The model `x` does not exist" } })),
    ).toBe("model_not_found");
    expect(
      classifyResponseFailure(
        400,
        JSON.stringify({ error: { message: "Unsupported parameter: 'temperature'", type: "invalid_request_error" } }),
      ),
    ).toBe("unsupported_parameter");
    expect(classifyResponseFailure(403, "forbidden")).toBe("destination_4xx");
    expect(classifyResponseFailure(429, "rate limited")).toBe("destination_4xx");
  });

  it("refuses to classify anything that could already have been billed", () => {
    // Our own timeout firing: the destination may be generating right now.
    expect(classifyTransportFailure(true)).toBeNull();
    expect(classifyResponseFailure(500, "internal error")).toBeNull();
    expect(classifyResponseFailure(502, "bad gateway")).toBeNull();
    expect(classifyResponseFailure(503, "overloaded")).toBeNull();
    expect(classifyResponseFailure(200, "{}")).toBeNull();
    expect(classifyResponseFailure(302, "")).toBeNull();
  });
});

/* --------------------------------------------- 2. a real fallback, end to end */

describe("a rerouted request that is refused pre-billing falls back once, and says so", () => {
  it("retries with the caller's own model, discloses it, and reports it", async () => {
    const { events, fallbacks, queue } = collector();
    const { bodies, fetchImpl } = scripted([
      () =>
        new Response(JSON.stringify({ error: { message: "The model `gpt-4o-mini` does not exist" } }), {
          status: 404,
          headers: { "content-type": "application/json" },
        }),
      ok,
    ]);

    const response = await handleProxy(callerRequest(), {
      config: config(),
      queue,
      fetchImpl,
      switchMap: await mapWith([entry()]),
    });
    await settle();

    // Exactly two attempts: the rewritten one, then the caller's original.
    expect(bodies).toHaveLength(2);
    expect(JSON.parse(bodies[0]!).model).toBe("gpt-4o-mini");
    expect(JSON.parse(bodies[1]!).model).toBe("gpt-4o");
    // The retry is the caller's request, byte-for-byte.
    expect(bodies[1]).toBe(CALLER_BODY);

    // The caller sees a working response AND sees what happened to it.
    expect(response.status).toBe(200);
    expect(response.headers.get("x-costmyai-reroute")).toBe("fell_back");
    expect(response.headers.get("x-costmyai-reroute-fallback")).toBe("model_not_found");
    expect(response.headers.get("x-costmyai-switch")).toBe(SWITCH_ID);
    expect(response.headers.get("x-costmyai-attempted-model")).toBe("gpt-4o-mini");
    expect(response.headers.get("x-costmyai-model")).toBe("gpt-4o");

    // Two real events: the failed rerouted attempt, and the served request.
    expect(events).toHaveLength(2);
    const failed = events[0]!;
    expect(failed.status).toBe("error");
    expect(failed.rerouted).toBe(true);
    expect(failed.model_key).toBe("gpt-4o-mini");
    expect(failed.original_model_key).toBe("gpt-4o");
    expect(failed.original_host).toBe("api.openai.com");
    expect(failed.route_reason).toBe(SWITCH_ID);
    expect(failed.fallback_reason).toBe("model_not_found");
    // The served request is honestly NOT rerouted — it ran on the caller's model.
    expect(events[1]!.rerouted).toBeUndefined();
    expect(events[1]!.model_key).toBe("gpt-4o");

    // The real v2 schema accepts both, including the new field.
    expect(ingestBatchSchema.safeParse({ v: 2, events }).success).toBe(true);

    // And the control plane hears about it.
    expect(fallbacks).toHaveLength(1);
    expect(fallbacks[0]).toMatchObject({
      switch_id: SWITCH_ID,
      reason: "model_not_found",
      status_code: 404,
      model_key: "gpt-4o-mini",
      host: "api.openai.com",
    });
  });

  it("falls back when the destination cannot be reached at all", async () => {
    const { events, fallbacks, queue } = collector();
    const { bodies, fetchImpl } = scripted([
      () => Promise.reject(new Error("ECONNREFUSED")),
      ok,
    ]);
    const response = await handleProxy(callerRequest(), {
      config: config(),
      queue,
      fetchImpl,
      switchMap: await mapWith([entry()]),
    });
    await settle();

    expect(bodies).toHaveLength(2);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-costmyai-reroute-fallback")).toBe("connection_error");
    expect(fallbacks[0]).toMatchObject({ reason: "connection_error", status_code: null });
    expect(events[0]!.fallback_reason).toBe("connection_error");
  });
});

/* ------------------------------------------- 3. what must never fall back */

describe("failures that could already have cost money are never retried", () => {
  it("passes a 5xx from the destination straight back, once", async () => {
    const { events, fallbacks, queue } = collector();
    const { bodies, fetchImpl } = scripted([
      () => new Response("upstream exploded", { status: 503, headers: { "content-type": "text/plain" } }),
    ]);
    const response = await handleProxy(callerRequest(), {
      config: config(),
      queue,
      fetchImpl,
      switchMap: await mapWith([entry()]),
    });
    await settle();

    expect(bodies).toHaveLength(1);
    expect(response.status).toBe(503);
    // Byte-identical body, and no fallback claimed anywhere.
    expect(await response.text()).toBe("upstream exploded");
    expect(response.headers.get("x-costmyai-reroute")).toBe("applied");
    expect(response.headers.get("x-costmyai-reroute-fallback")).toBeNull();
    expect(fallbacks).toHaveLength(0);
    expect(events).toHaveLength(1);
    expect(events[0]!.rerouted).toBe(true);
    expect(events[0]!.fallback_reason).toBeUndefined();
  });

  it("never retries our own timeout", async () => {
    const { events, fallbacks, queue } = collector();
    let attempts = 0;
    const fetchImpl = (async (_url: string | URL, init: RequestInit) => {
      attempts += 1;
      // Hang until the container's own abort fires, exactly as a slow provider does.
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    }) as unknown as typeof fetch;

    const response = await handleProxy(callerRequest(), {
      config: config({ COSTMYAI_UPSTREAM_TIMEOUT_MS: "60" }),
      queue,
      fetchImpl,
      switchMap: await mapWith([entry()]),
    });
    await settle();

    expect(attempts).toBe(1);
    expect(response.status).toBe(504);
    expect(JSON.parse(await response.text()).error.type).toBe("costmyai_upstream_timeout");
    expect(fallbacks).toHaveLength(0);
    expect(events[0]!.fallback_reason).toBeUndefined();
  });

  it("never falls back once the caller has bytes — a stream that dies mid-flight is final", async () => {
    const { events, fallbacks, queue } = collector();
    let attempts = 0;
    const fetchImpl = (async () => {
      attempts += 1;
      // 200, headers sent, first chunk delivered — then the stream breaks.
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"He"}}]}\n\n'));
          controller.error(new Error("connection reset mid-stream"));
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    }) as unknown as typeof fetch;

    const response = await handleProxy(callerRequest(), {
      config: config(),
      queue,
      fetchImpl,
      switchMap: await mapWith([entry()]),
    });

    // The caller got the rewritten call's response, and it is theirs now.
    expect(response.status).toBe(200);
    expect(response.headers.get("x-costmyai-reroute")).toBe("applied");
    await expect(response.text()).rejects.toBeTruthy();
    await settle();

    // The one thing that must be true: it was never sent twice.
    expect(attempts).toBe(1);
    expect(fallbacks).toHaveLength(0);
    expect(events.every((e) => e.fallback_reason === undefined)).toBe(true);
  });
});

/* --------------------------------------- 4. untouched traffic stays untouched */

describe("a request no switch matched behaves exactly as it did before Stage 5", () => {
  it("does not fall back on a 400 it was never rerouted for", async () => {
    const { events, fallbacks, queue } = collector();
    const { bodies, fetchImpl } = scripted([
      () =>
        new Response(JSON.stringify({ error: { message: "Unsupported parameter: 'temperature'" } }), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
    ]);
    const response = await handleProxy(callerRequest(), {
      config: config(),
      queue,
      fetchImpl,
      switchMap: await mapWith([entry({ executable: false, blocked_reason: "routing_not_granted" })]),
    });
    await settle();

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toBe(CALLER_BODY);
    expect(response.status).toBe(400);
    expect(response.headers.get("x-costmyai-reroute")).toBeNull();
    expect(fallbacks).toHaveLength(0);
    expect(events[0]!.rerouted).toBeUndefined();
  });
});
