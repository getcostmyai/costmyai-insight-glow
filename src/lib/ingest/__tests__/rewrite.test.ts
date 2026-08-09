/**
 * Dispatch 155, Stage 4 — the first stage that is allowed to change a real
 * request. The proofs run in both directions:
 *
 *  1. Byte-identical pass-through for every non-matching request — the
 *    overwhelming majority of real traffic. Method, path, query, headers and
 *    body bytes are captured at the upstream and compared to what the caller
 *    sent, and the response is asserted to carry no disclosure header at all.
 *  2. Explicit, tested refusal for the shapes Stage 4 must not touch: a
 *    SigV4-signed Bedrock request, a model-in-path Gemini request, a
 *    non-JSON body, and a Phase 2/3 entry. Refused means forwarded untouched
 *    AND disclosed, never silently mishandled.
 *  3. Disclosure headers present and correct on every rewritten call.
 *  4. The ingest fields `rerouted`, `original_model_key`, `original_host` and
 *    `route_reason` populated end to end and accepted by the real v2 schema —
 *    this is what Dispatch 151's saved_usd reconciliation reads.
 */
import { describe, expect, it } from "vitest";

import { ingestBatchSchema } from "@/lib/ingest/schema";
import type { SwitchPlan, SwitchPlanEntry } from "@/lib/ingest/switch-plan";

import { loadConfig } from "../../../../packages/gateway-container/src/config";
import { handleProxy, type ProxyEvent } from "../../../../packages/gateway-container/src/proxy";
import { planRewrite } from "../../../../packages/gateway-container/src/rewrite";
import type { QueueItem, UpstreamQueue } from "../../../../packages/gateway-container/src/queue";
import { SwitchMap } from "../../../../packages/gateway-container/src/switch-map";

const UPSTREAM = "https://api.openai.com";
const SWITCH_ID = "11111111-2222-4333-8444-555555555555";

function config() {
  return loadConfig({
    COSTMYAI_INGEST_TOKEN: "cma_live_stage4",
    COSTMYAI_UPSTREAM_URL: UPSTREAM,
    COSTMYAI_SPOOL_DIR: "/tmp/costmyai-d155-stage4",
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

/** A real SwitchMap, populated through its real poll + parse path. */
async function mapWith(entries: SwitchPlanEntry[]): Promise<SwitchMap> {
  const plan: SwitchPlan = {
    v: 1,
    org_id: "org-stage4",
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

interface Seen {
  url: string;
  method: string;
  body: string;
  headers: Record<string, string>;
}

function upstream(payload: unknown = { model: "gpt-4o-mini", usage: { prompt_tokens: 5, completion_tokens: 2 } }) {
  const seen: Seen[] = [];
  const fetchImpl = (async (url: string | URL, init: RequestInit) => {
    const headers = new Headers(init.headers);
    const raw = init.body as Uint8Array | undefined;
    seen.push({
      url: String(url),
      method: init.method ?? "GET",
      body: raw ? new TextDecoder().decode(raw) : "",
      headers: Object.fromEntries(headers.entries()),
    });
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { seen, fetchImpl };
}

async function settle(): Promise<void> {
  await new Promise((r) => setTimeout(r, 30));
}

/* ------------------------------------------------ 1. byte-identical passthrough */

describe("non-matching traffic is byte-identical, as it was before Stage 4 existed", () => {
  const body = JSON.stringify({
    model: "gpt-4.1",
    messages: [{ role: "user", content: "hello" }],
    temperature: 0.4,
    stream: false,
  });

  const cases: Array<[string, () => Promise<SwitchMap | undefined>]> = [
    ["no switch map at all", async () => undefined],
    ["a fresh plan with no matching model", async () => mapWith([entry()])],
    [
      "a matching model on a switch the server marked non-executable",
      async () =>
        mapWith([entry({ match: { model_keys: ["gpt-4.1"], hosts: ["api.openai.com"] }, executable: false })]),
    ],
    ["an empty plan", async () => mapWith([])],
    [
      "a stale plan (older than the staleness bound)",
      async () => {
        const map = await mapWith([entry({ match: { model_keys: ["gpt-4.1"], hosts: ["api.openai.com"] } })]);
        // Age the plan past its bound without touching the request path.
        (map as unknown as { fetchedAtMs: number }).fetchedAtMs = Date.now() - 10 * 60_000;
        return map;
      },
    ],
  ];

  for (const [label, build] of cases) {
    it(`${label} → request forwarded byte-for-byte, no disclosure header`, async () => {
      // The provider echoes the model the caller asked for; nothing rewrote it.
      const { seen, fetchImpl } = upstream({ model: "gpt-4.1", usage: { prompt_tokens: 5, completion_tokens: 2 } });
      const { events, queue } = collector();
      const switchMap = await build();

      const response = await handleProxy(
        new Request("http://localhost:8787/v1/chat/completions?beta=1", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: "Bearer sk-customer-key" },
          body,
        }),
        { config: config(), queue, fetchImpl, ...(switchMap ? { switchMap } : {}) },
      );
      await response.text();
      await settle();

      expect(seen).toHaveLength(1);
      expect(seen[0]!.method).toBe("POST");
      expect(seen[0]!.url).toBe("https://api.openai.com/v1/chat/completions?beta=1");
      // The bytes, exactly. Not a re-serialisation that happens to be equal.
      expect(seen[0]!.body).toBe(body);
      expect(seen[0]!.headers["authorization"]).toBe("Bearer sk-customer-key");

      for (const name of [...response.headers.keys()]) {
        expect(name.startsWith("x-costmyai-")).toBe(false);
      }
      expect(events[0]!.rerouted).toBeUndefined();
      expect(events[0]!.original_model_key).toBeUndefined();
      expect(events[0]!.route_reason).toBeUndefined();
      expect(events[0]!.model_key).toBe("gpt-4.1");
    });
  }
});

/* ------------------------------------------------------------- 2. refusals */

describe("shapes Stage 4 must refuse are refused, and disclosed", () => {
  it("a SigV4-signed Bedrock request is refused, body untouched", async () => {
    const { seen, fetchImpl } = upstream({ usage: { inputTokens: 4, outputTokens: 1 } });
    const { events, queue } = collector();
    const body = JSON.stringify({ modelId: "anthropic.claude-3-sonnet", messages: [] });
    const switchMap = await mapWith([
      entry({
        match: { model_keys: ["anthropic.claude-3-sonnet"], hosts: ["api.openai.com"] },
      }),
    ]);

    const response = await handleProxy(
      new Request("http://localhost:8787/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization:
            "AWS4-HMAC-SHA256 Credential=AKIA/20260809/us-east-1/bedrock/aws4_request, Signature=deadbeef",
          "x-amz-date": "20260809T120000Z",
        },
        body,
      }),
      { config: config(), queue, fetchImpl, switchMap },
    );
    await response.text();
    await settle();

    expect(seen[0]!.body).toBe(body);
    expect(response.headers.get("x-costmyai-reroute")).toBe("refused");
    expect(response.headers.get("x-costmyai-reroute-refused")).toBe("signed_request");
    expect(events[0]!.rerouted).toBeUndefined();
  });

  it("a model-in-path (Gemini/Bedrock URL) request is refused", async () => {
    const { seen, fetchImpl } = upstream({ usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 1 } });
    const { events, queue } = collector();
    const body = JSON.stringify({ contents: [] });
    const switchMap = await mapWith([
      entry({ match: { model_keys: ["gemini-2.5-flash"], hosts: ["api.openai.com"] } }),
    ]);

    const response = await handleProxy(
      new Request("http://localhost:8787/v1beta/models/gemini-2.5-flash:generateContent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      }),
      { config: config(), queue, fetchImpl, switchMap },
    );
    await response.text();
    await settle();

    expect(seen[0]!.body).toBe(body);
    expect(seen[0]!.url).toContain("gemini-2.5-flash:generateContent");
    expect(response.headers.get("x-costmyai-reroute-refused")).toBe("model_in_path");
    expect(events[0]!.rerouted).toBeUndefined();
  });

  it("a Phase 2 (cross-provider) entry is refused by the container even if a plan says executable", async () => {
    const { seen, fetchImpl } = upstream();
    const { queue } = collector();
    const body = JSON.stringify({ model: "gpt-4o", messages: [] });
    const switchMap = await mapWith([
      entry({ phase: 2, gate: "granted", target: { model_key: "llama-3.3-70b", host: "together" } }),
    ]);

    const response = await handleProxy(
      new Request("http://localhost:8787/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      }),
      { config: config(), queue, fetchImpl, switchMap },
    );
    await response.text();

    expect(seen[0]!.body).toBe(body);
    expect(response.headers.get("x-costmyai-reroute-refused")).toBe("phase_not_supported");
  });

  it("a Phase 3 (Bedrock/Vertex) entry is refused", async () => {
    const { seen, fetchImpl } = upstream();
    const { queue } = collector();
    const body = JSON.stringify({ model: "gpt-4o", messages: [] });
    const switchMap = await mapWith([
      entry({ phase: 3, target: { model_key: "amazon.nova-pro", host: "bedrock" } }),
    ]);

    const response = await handleProxy(
      new Request("http://localhost:8787/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      }),
      { config: config(), queue, fetchImpl, switchMap },
    );
    await response.text();

    expect(seen[0]!.body).toBe(body);
    expect(response.headers.get("x-costmyai-reroute-refused")).toBe("phase_not_supported");
  });

  it("an unrecognized body shape is refused at the rewrite boundary, not guessed at", () => {
    // A body the container cannot read as a JSON object with a model field can
    // never be rewritten. Proven directly, because at proxy level such a
    // request has no liftable model and therefore never matches a switch at
    // all — two independent reasons it is left alone.
    for (const body of ["not json at all", JSON.stringify([1, 2, 3]), JSON.stringify({ messages: [] })]) {
      const outcome = planRewrite({
        lookup: { id: SWITCH_ID, phase: 1, target: { model_key: "gpt-4o-mini", host: "api.openai.com" } },
        path: "/v1/chat/completions",
        headers: new Headers(),
        body: new TextEncoder().encode(body),
        originalModel: "gpt-4o",
        originalHost: "api.openai.com",
      });
      expect(outcome.rerouted).toBe(false);
      expect(outcome.refusal).toBe("unrecognized_shape");
      expect(outcome.body).toBeUndefined();
    }
  });

  it("a body the container cannot read passes through byte-for-byte", async () => {
    const { seen, fetchImpl } = upstream();
    const { queue } = collector();
    const switchMap = await mapWith([entry()]);
    const raw = "model=gpt-4o&prompt=hello";

    const response = await handleProxy(
      new Request("http://localhost:8787/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: raw,
      }),
      { config: config(), queue, fetchImpl, switchMap },
    );
    await response.text();

    expect(seen[0]!.body).toBe(raw);
    expect(response.headers.get("x-costmyai-reroute")).toBeNull();
  });
});

/* ------------------------------------------- 3+4. the rewrite, and its event */

describe("a real same-host model swap", () => {
  it("rewrites only the model field, discloses it, and reports it end to end", async () => {
    const { seen, fetchImpl } = upstream();
    const { events, queue } = collector();
    const switchMap = await mapWith([entry()]);

    const response = await handleProxy(
      new Request("http://localhost:8787/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer sk-customer-key" },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [{ role: "user", content: "hello" }],
          temperature: 0.2,
        }),
      }),
      { config: config(), queue, fetchImpl, switchMap },
    );
    await response.text();
    await settle();

    // Only the model changed. Every other field is carried across untouched,
    // and the customer's own key went upstream exactly as they sent it.
    const forwarded = JSON.parse(seen[0]!.body) as Record<string, unknown>;
    expect(forwarded).toEqual({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "hello" }],
      temperature: 0.2,
    });
    expect(seen[0]!.headers["authorization"]).toBe("Bearer sk-customer-key");
    expect(seen[0]!.url).toBe("https://api.openai.com/v1/chat/completions");

    // Disclosure, on the caller's own response.
    expect(Object.fromEntries([...response.headers.entries()].filter(([k]) => k.startsWith("x-costmyai-")))).toEqual({
      "x-costmyai-reroute": "applied",
      "x-costmyai-switch": SWITCH_ID,
      "x-costmyai-original-model": "gpt-4o",
      "x-costmyai-original-host": "api.openai.com",
      "x-costmyai-model": "gpt-4o-mini",
      "x-costmyai-host": "api.openai.com",
    });

    // The event Dispatch 151's saved_usd reconciliation will read.
    const event = events[0]!;
    expect(event.rerouted).toBe(true);
    expect(event.model_key).toBe("gpt-4o-mini");
    expect(event.original_model_key).toBe("gpt-4o");
    expect(event.original_host).toBe("api.openai.com");
    expect(event.route_reason).toBe(SWITCH_ID);

    // And it is accepted by the real contract, as a v2 batch.
    const parsed = ingestBatchSchema.parse({ v: 2, events: [event] });
    expect(parsed.events[0]!.rerouted).toBe(true);
    expect(parsed.events[0]!.route_reason).toBe(SWITCH_ID);
  });

  it("streaming responses are rewritten and reported the same way", async () => {
    const chunks = [
      'data: {"model":"gpt-4o-mini","choices":[{"delta":{"content":"hi"}}]}\n\n',
      'data: {"usage":{"prompt_tokens":8,"completion_tokens":3}}\n\ndata: [DONE]\n\n',
    ];
    const fetchImpl = (async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            for (const c of chunks) controller.enqueue(new TextEncoder().encode(c));
            controller.close();
          },
        }),
        { status: 200, headers: { "content-type": "text/event-stream" } },
      )) as unknown as typeof fetch;
    const { events, queue } = collector();
    const switchMap = await mapWith([entry()]);

    const response = await handleProxy(
      new Request("http://localhost:8787/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "gpt-4o", stream: true, messages: [] }),
      }),
      { config: config(), queue, fetchImpl, switchMap },
    );
    expect(await response.text()).toBe(chunks.join(""));
    await settle();

    expect(response.headers.get("x-costmyai-reroute")).toBe("applied");
    expect(events[0]!.rerouted).toBe(true);
    expect(events[0]!.original_model_key).toBe("gpt-4o");
    expect(events[0]!.input_tokens).toBe(8);
    expect(events[0]!.output_tokens).toBe(3);
  });
});
