import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";

import { describe, expect, it } from "vitest";

import { loadConfig } from "../../../../packages/gateway-container/src/config";
import { createGateway } from "../../../../packages/gateway-container/src/index";
import {
  parsePlan,
  SwitchMap,
  STALE_AFTER_MS,
} from "../../../../packages/gateway-container/src/switch-map";
import type { SwitchPlan } from "../switch-plan";

/**
 * Stage 3 proof (Dispatch 155).
 *
 * The happy path is the easy half. The half that matters is the safety
 * property: unknown or stale poll state must mean pass-through, always. A
 * CostMyAI outage, a slow poll or a garbled plan must never change what a
 * customer's traffic does — not by rerouting it, and not by blocking it.
 */

const plan = (overrides: Partial<SwitchPlan["switches"][number]> = {}): SwitchPlan => ({
  v: 1,
  org_id: "00000000-0000-0000-0000-000000000001",
  generated_at: new Date().toISOString(),
  poll_interval_ms: 60_000,
  switches: [
    {
      id: "sw-1",
      phase: 1,
      match: { model_keys: ["gpt-4o", "gpt-4o-2024-08-06"], hosts: ["openai", "api.openai.com"] },
      target: { model_key: "gpt-4o-mini", host: "openai" },
      gate: "connected",
      executable: true,
      needs_confirmation: false,
      ...overrides,
    },
  ],
});

function config(overrides: Record<string, string> = {}) {
  return loadConfig({
    COSTMYAI_INGEST_TOKEN: "cma_live_test",
    COSTMYAI_UPSTREAM_URL: "https://api.openai.com",
    COSTMYAI_SPOOL_DIR: "/tmp/costmyai-switchmap-test",
    ...overrides,
  });
}

function fetchReturning(fn: () => Response | Promise<Response>): typeof fetch {
  return (async () => fn()) as unknown as typeof fetch;
}

describe("switch map — the fail-safe direction", () => {
  it("matches nothing before the first successful poll", () => {
    const map = new SwitchMap(config(), fetchReturning(() => new Response("{}")));
    expect(map.lookup("gpt-4o", "openai")).toBeNull();
    expect(map.status().active).toBe(false);
  });

  it("serves a fresh plan, and only its executable entries", async () => {
    const map = new SwitchMap(config(), fetchReturning(() => Response.json(plan())));
    expect(await map.refresh()).toBe(true);
    expect(map.lookup("GPT-4o", "API.OpenAI.com")?.target.model_key).toBe("gpt-4o-mini");
    expect(map.lookup("claude-sonnet-4", "anthropic")).toBeNull();

    const blocked = new SwitchMap(
      config(),
      fetchReturning(() =>
        Response.json(plan({ executable: false, blocked_reason: "routing_not_granted" })),
      ),
    );
    await blocked.refresh();
    expect(blocked.lookup("gpt-4o", "openai")).toBeNull();
  });

  it("keeps the last good plan through a failed poll, then forgets it when stale", async () => {
    let now = 1_000_000;
    let responder: () => Response = () => Response.json(plan());
    const map = new SwitchMap(
      config(),
      fetchReturning(() => responder()),
      () => now,
    );
    await map.refresh();
    expect(map.lookup("gpt-4o", "openai")).not.toBeNull();

    // CostMyAI goes down. The plan we already hold is still trustworthy.
    responder = () => new Response("boom", { status: 500 });
    now += 30_000;
    expect(await map.refresh()).toBe(false);
    expect(map.lookup("gpt-4o", "openai")).not.toBeNull();
    expect(map.status().lastError).toBe("switch plan 500");

    // The outage outlasts the staleness bound: we stop acting on a decision we
    // can no longer confirm, and traffic goes back to untouched pass-through.
    now += STALE_AFTER_MS;
    expect(map.lookup("gpt-4o", "openai")).toBeNull();
    expect(map.status()).toMatchObject({ active: false, stale: true, executable: 0 });
  });

  it("treats a hang, a network error and a garbled plan all as pass-through", async () => {
    const hung = new SwitchMap(
      config(),
      (async () => {
        throw new DOMException("The operation was aborted.", "AbortError");
      }) as unknown as typeof fetch,
    );
    expect(await hung.refresh()).toBe(false);
    expect(hung.lookup("gpt-4o", "openai")).toBeNull();

    const refused = new SwitchMap(
      config(),
      (async () => {
        throw new Error("ECONNREFUSED");
      }) as unknown as typeof fetch,
    );
    expect(await refused.refresh()).toBe(false);
    expect(refused.lookup("gpt-4o", "openai")).toBeNull();

    for (const body of [
      "not json at all",
      JSON.stringify({ v: 99, org_id: "x", switches: [] }),
      JSON.stringify({ v: 1, org_id: "x", switches: [{ id: "sw-1" }] }),
    ]) {
      const garbled = new SwitchMap(
        config(),
        fetchReturning(() => new Response(body, { headers: { "content-type": "application/json" } })),
      );
      expect(await garbled.refresh()).toBe(false);
      expect(garbled.lookup("gpt-4o", "openai")).toBeNull();
    }
  });

  it("rejects a plan it cannot read completely rather than reading half of it", () => {
    expect(parsePlan(plan())).not.toBeNull();
    expect(parsePlan({ ...plan(), switches: [{ id: "a", phase: 4 }] })).toBeNull();
    expect(parsePlan(null)).toBeNull();
  });

  it("treats a backwards clock as unknown, not as fresh", async () => {
    let now = 1_000_000;
    const map = new SwitchMap(
      config(),
      fetchReturning(() => Response.json(plan())),
      () => now,
    );
    await map.refresh();
    now -= 5_000;
    expect(map.lookup("gpt-4o", "openai")).toBeNull();
  });
});

describe("switch map — the request path never waits on CostMyAI", () => {
  it("proxies byte-identically while the poll endpoint is dead", async () => {
    // A real upstream provider, and a control plane that starts up and then
    // dies mid-test. The customer's request must be untouched throughout.
    const upstream = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const body = Buffer.concat(chunks).toString();
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            seen_body: JSON.parse(body || "{}"),
            usage: { prompt_tokens: 11, completion_tokens: 7 },
          }),
        );
      });
    });
    await new Promise<void>((r) => upstream.listen(0, r));
    const upstreamPort = (upstream.address() as AddressInfo).port;

    let controlPlaneHits = 0;
    const controlPlane: Server = createServer((_req, res) => {
      controlPlaneHits += 1;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(plan()));
    });
    await new Promise<void>((r) => controlPlane.listen(0, r));
    const controlPort = (controlPlane.address() as AddressInfo).port;

    const gateway = createGateway(
      config({
        COSTMYAI_UPSTREAM_URL: `http://127.0.0.1:${upstreamPort}`,
        COSTMYAI_BASE_URL: `http://127.0.0.1:${controlPort}`,
        COSTMYAI_PORT: "0",
      }),
    );
    await new Promise<void>((r) => gateway.server.listen(0, r));
    const port = (gateway.server.address() as AddressInfo).port;

    // Give the first poll a moment; then confirm we really did fetch a plan.
    await new Promise((r) => setTimeout(r, 200));
    expect(controlPlaneHits).toBeGreaterThan(0);
    expect(gateway.switches.status().active).toBe(true);
    expect(gateway.switches.lookup("gpt-4o", "openai")).not.toBeNull();

    const call = async () => {
      const started = Date.now();
      const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer sk-customer-key" },
        body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "user", content: "hi" }] }),
      });
      return { json: (await res.json()) as { seen_body: { model: string } }, ms: Date.now() - started };
    };

    const healthy = await call();
    // Stage 3 does not rewrite anything yet, and even with an executable switch
    // in memory the upstream sees the customer's own model, untouched.
    expect(healthy.json.seen_body.model).toBe("gpt-4o");

    // Now kill the control plane mid-flight, hard.
    await new Promise<void>((r) => controlPlane.close(() => r()));
    const hitsAtDeath = controlPlaneHits;

    const duringOutage = await call();
    expect(duringOutage.json.seen_body.model).toBe("gpt-4o");
    // Not merely correct — unblocked. The request path never opened a socket to us.
    expect(duringOutage.ms).toBeLessThan(2_000);
    expect(controlPlaneHits).toBe(hitsAtDeath);

    // And a forced poll against the dead endpoint neither throws nor blocks.
    expect(await gateway.switches.refresh()).toBe(false);
    expect(gateway.switches.status().lastError).toBeTruthy();

    const afterFailedPoll = await call();
    expect(afterFailedPoll.json.seen_body.model).toBe("gpt-4o");

    await gateway.shutdown("SIGTERM");
    await new Promise<void>((r) => upstream.close(() => r()));
  }, 20_000);
});
