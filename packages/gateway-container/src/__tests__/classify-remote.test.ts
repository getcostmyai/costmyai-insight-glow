import { describe, expect, it } from "vitest";

import { RemoteClassifier, SlotPool, REMOTE_POOL_WIDTH } from "../classify-remote.js";
import { loadConfig } from "../config.js";

const config = () =>
  loadConfig({
    COSTMYAI_INGEST_TOKEN: "cma_live_test",
    COSTMYAI_UPSTREAM_URL: "https://api.anthropic.com",
    COSTMYAI_BASE_URL: "https://costmyai.test",
    COSTMYAI_CLASSIFY_LOCAL: "true",
    COSTMYAI_CLASSIFY_REMOTE: "true",
  });

const body = (obj: unknown) => new TextEncoder().encode(JSON.stringify(obj));

const prompt = body({
  model: "claude-opus-4-5",
  messages: [{ role: "user", content: "Prove that the sum of two odd integers is always even." }],
});

const ok = (hint: string) =>
  (async () => new Response(JSON.stringify({ hint, confidence: 0.8 }), { status: 200 })) as unknown as typeof fetch;

describe("remote classifier", () => {
  it("returns the remote label with its source and confidence", async () => {
    const c = new RemoteClassifier({ config: config(), fetchImpl: ok("reasoning") });
    const d = await c.classify(prompt);
    expect(d.hint).toBe("reasoning");
    expect(d.confidence).toBe(0.8);
    expect(d.source).toBe("content");
  });

  it("abstains — never guesses — when the endpoint fails", async () => {
    const c = new RemoteClassifier({
      config: config(),
      fetchImpl: (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch,
    });
    const d = await c.classify(prompt);
    expect(d.hint).toBe("unknown");
    expect(d.confidence).toBe(0);
    expect(d.abstained).toBe("remote_unavailable");
  });

  it("abstains with remote_timeout rather than hanging a slot forever", async () => {
    const c = new RemoteClassifier({
      config: config(),
      timeoutMs: 10,
      fetchImpl: ((_u: string, init?: RequestInit) =>
        new Promise((_res, rej) => {
          init?.signal?.addEventListener("abort", () => {
            const e = new Error("aborted");
            e.name = "AbortError";
            rej(e);
          });
        })) as unknown as typeof fetch,
    });
    const d = await c.classify(prompt);
    expect(d.abstained).toBe("remote_timeout");
  });

  it("sheds load instead of queueing when every slot is busy", async () => {
    const pool = new SlotPool(1);
    let release: (() => void) | null = null;
    const c = new RemoteClassifier({
      config: config(),
      pool,
      fetchImpl: (async () =>
        new Promise<Response>((res) => {
          release = () => res(new Response(JSON.stringify({ hint: "code", confidence: 0.8 })));
        })) as unknown as typeof fetch,
    });

    const inFlight = c.classify(prompt);
    // Let the first call take the only slot.
    await new Promise((r) => setTimeout(r, 0));

    const shed = await c.classify(prompt);
    expect(shed.abstained).toBe("pool_saturated");
    // Crucially it came back immediately, without waiting on the in-flight call.
    expect(release).not.toBeNull();

    release!();
    await inFlight;
    // And the slot is returned, so the next request is served normally.
    expect(pool.free).toBe(1);
  });

  it("never sends a body it could not read", async () => {
    let called = false;
    const c = new RemoteClassifier({
      config: config(),
      fetchImpl: (async () => {
        called = true;
        return new Response("{}");
      }) as unknown as typeof fetch,
    });
    const d = await c.classify(new TextEncoder().encode("not json at all"));
    expect(called).toBe(false);
    expect(d.hint).toBe("unknown");
  });

  it("pool width is the value derived from gpt-5-mini's own p90", () => {
    expect(REMOTE_POOL_WIDTH).toBe(7);
  });
});

describe("remote classification config", () => {
  it("is off unless asked for", () => {
    expect(loadConfig({
      COSTMYAI_INGEST_TOKEN: "cma_live_test",
      COSTMYAI_UPSTREAM_URL: "https://api.anthropic.com",
      COSTMYAI_CLASSIFY_LOCAL: "true",
    }).classifyRemote).toBe(false);
  });

  it("cannot be on while local content reading is off", () => {
    expect(loadConfig({
      COSTMYAI_INGEST_TOKEN: "cma_live_test",
      COSTMYAI_UPSTREAM_URL: "https://api.anthropic.com",
      COSTMYAI_CLASSIFY_LOCAL: "false",
      COSTMYAI_CLASSIFY_REMOTE: "true",
    }).classifyRemote).toBe(false);
  });

  it("an operator's explicit off beats the v3 image default", () => {
    expect(loadConfig({
      COSTMYAI_INGEST_TOKEN: "cma_live_test",
      COSTMYAI_UPSTREAM_URL: "https://api.anthropic.com",
      COSTMYAI_CLASSIFY_LOCAL_DEFAULT: "true",
      COSTMYAI_CLASSIFY_REMOTE_DEFAULT: "true",
      COSTMYAI_CLASSIFY_REMOTE: "false",
    }).classifyRemote).toBe(false);
  });

  it("the v3 image default turns it on when the operator says nothing", () => {
    expect(loadConfig({
      COSTMYAI_INGEST_TOKEN: "cma_live_test",
      COSTMYAI_UPSTREAM_URL: "https://api.anthropic.com",
      COSTMYAI_CLASSIFY_LOCAL_DEFAULT: "true",
      COSTMYAI_CLASSIFY_REMOTE_DEFAULT: "true",
    }).classifyRemote).toBe(true);
  });
});
