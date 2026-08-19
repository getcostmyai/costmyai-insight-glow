import { describe, expect, it } from "vitest";

import { RemoteClassifier, SlotPool } from "../classify-remote.js";
import { loadConfig } from "../config.js";
import { handleProxy } from "../proxy.js";
import { UpstreamQueue } from "../queue.js";

/**
 * Dispatch 236 — the two claims that make the remote pass safe, proved at the
 * proxy boundary rather than in the classifier's own unit tests:
 *
 *  1. A remote label lands on the very event the request produced.
 *  2. The caller's response is never delayed or altered by classification, and
 *     a saturated pool leaves the event honestly `unknown`.
 */

const config = (over: Record<string, string> = {}) =>
  loadConfig({
    COSTMYAI_INGEST_TOKEN: "cma_live_test",
    COSTMYAI_UPSTREAM_URL: "https://api.anthropic.com",
    COSTMYAI_BASE_URL: "https://costmyai.test",
    COSTMYAI_CLASSIFY_LOCAL: "true",
    COSTMYAI_CLASSIFY_REMOTE: "true",
    ...over,
  });

// A prompt the LOCAL rules cannot place — the exact case remote exists for.
const REQUEST_BODY = JSON.stringify({
  model: "claude-opus-4-5",
  messages: [{ role: "user", content: "Given the constraints above, decide which supplier to keep and justify it." }],
});

const upstreamOk = (async () =>
  new Response(
    JSON.stringify({
      model: "claude-opus-4-5",
      usage: { input_tokens: 120, output_tokens: 40 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  )) as unknown as typeof fetch;

function harness(remoteFetch: typeof fetch, pool?: SlotPool) {
  const cfg = config();
  const queue = new UpstreamQueue(cfg, (async () => new Response("{}")) as unknown as typeof fetch);
  const remote = new RemoteClassifier({ config: cfg, fetchImpl: remoteFetch, pool });
  return { cfg, queue, remote };
}

const proxyRequest = () =>
  new Request("http://localhost:8787/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: REQUEST_BODY,
  });

const firstEvent = (queue: UpstreamQueue) => {
  const items = (queue as unknown as { items: Array<{ body: { events: Array<Record<string, unknown>> } }> }).items;
  return items.at(-1)?.body.events[0];
};

// The off-path write is deliberately deferred a turn of the event loop, so a
// proof of it has to wait the same way a real flush does.
const settle = async () => {
  for (let i = 0; i < 20; i += 1) await new Promise((r) => setTimeout(r, 5));
};

describe("off-path remote classification", () => {
  it("labels the queued event after the caller already has their response", async () => {
    const { cfg, queue, remote } = harness(
      (async () => new Response(JSON.stringify({ hint: "reasoning", confidence: 0.8 }))) as unknown as typeof fetch,
    );

    const response = await handleProxy(proxyRequest(), {
      config: cfg,
      queue,
      remote,
      fetchImpl: upstreamOk,
    } as never);

    // The response is complete and the label is NOT yet known — proof the call
    // did not happen on the request path.
    expect(response.status).toBe(200);
    expect(response.headers.get("x-costmyai-task")).toBe("unknown");
    expect(response.headers.get("x-costmyai-task-final")).toBe("deferred");
    expect(firstEvent(queue)?.task_hint).toBe("unknown");

    await settle();

    // ...and then it lands, on that same event, with the remote revision.
    const event = firstEvent(queue);
    expect(event?.task_hint).toBe("reasoning");
    expect(event?.task_confidence).toBe(0.8);
    expect(event?.classifier_revision).toBe(2);
  });

  it("leaves the event honestly unknown when the pool is saturated", async () => {
    const pool = new SlotPool(1);
    // Take the only slot and never give it back.
    pool.tryAcquire();

    const { cfg, queue, remote } = harness(
      (async () => new Response(JSON.stringify({ hint: "reasoning", confidence: 0.8 }))) as unknown as typeof fetch,
      pool,
    );

    const response = await handleProxy(proxyRequest(), {
      config: cfg,
      queue,
      remote,
      fetchImpl: upstreamOk,
    } as never);

    expect(response.status).toBe(200);
    await settle();

    const event = firstEvent(queue);
    expect(event?.task_hint).toBe("unknown");
    expect(event?.task_confidence).toBe(0);
  });

  it("does not classify remotely when the local rules already placed the task", async () => {
    let remoteCalls = 0;
    const { cfg, queue, remote } = harness((async () => {
      remoteCalls += 1;
      return new Response(JSON.stringify({ hint: "generation", confidence: 0.8 }));
    }) as unknown as typeof fetch);

    await handleProxy(
      new Request("http://localhost:8787/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "claude-opus-4-5",
          messages: [
            {
              role: "user",
              content: "Fix this TypeError:\n```ts\nconst t = items.reduce((a,b)=>a+b)\n```",
            },
          ],
        }),
      }),
      { config: cfg, queue, remote, fetchImpl: upstreamOk } as never,
    );

    await settle();
    expect(remoteCalls).toBe(0);
    expect(firstEvent(queue)?.task_hint).toBe("code");
  });
});
