/**
 * Dispatch 231 — `COSTMYAI_ROUTE_KEY_<PROVIDER>` is read, and asserted.
 *
 * The contract declared this prefix in Dispatch 155 and the dashboard has been
 * telling customers to set it ever since, but the container never read the
 * variable and never told the server anything, so the Phase 2 gate could not
 * move no matter what a customer did. These tests fail if either half of that
 * path is removed again.
 */
import { describe, expect, it } from "vitest";

import { loadConfig, routeKeysFrom } from "../config";
import { SwitchMap } from "../switch-map";

const base = {
  COSTMYAI_INGEST_TOKEN: "cma_live_test",
  COSTMYAI_UPSTREAM_URL: "https://api.anthropic.com",
  COSTMYAI_BASE_URL: "http://localhost:8080",
};

describe("route key configuration", () => {
  it("reads a granted destination out of the environment", () => {
    expect(routeKeysFrom({ COSTMYAI_ROUTE_KEY_NOVITA: "sk-real" })).toEqual({ novita: "sk-real" });
  });

  it("spells multi-word hosts the way the plan spells them", () => {
    expect(routeKeysFrom({ COSTMYAI_ROUTE_KEY_AI21_LABS: "k" })).toEqual({ "ai21-labs": "k" });
  });

  it("ignores an empty grant rather than asserting a credential nobody set", () => {
    expect(routeKeysFrom({ COSTMYAI_ROUTE_KEY_NOVITA: "   " })).toEqual({});
  });

  it("carries the grant onto the loaded config", () => {
    const config = loadConfig({ ...base, COSTMYAI_ROUTE_KEY_NOVITA: "sk-real" });
    expect(config.routeKeys).toEqual({ novita: "sk-real" });
  });
});

describe("grant assertion", () => {
  it("sends the host names, and never the key", async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;

    const config = loadConfig({ ...base, COSTMYAI_ROUTE_KEY_NOVITA: "sk-secret-value" });
    const map = new SwitchMap(config, fetchImpl);
    expect(await map.assertGrants()).toBe(true);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.body).toMatchObject({ v: 2, hosts: ["novita"] });
    expect(JSON.stringify(calls[0]!.body)).not.toContain("sk-secret-value");
    expect(map.status().grantedHosts).toEqual(["novita"]);
  });

  it("asserts once, not on every poll", async () => {
    let posts = 0;
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "POST") posts += 1;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;
    const map = new SwitchMap(loadConfig({ ...base, COSTMYAI_ROUTE_KEY_NOVITA: "k" }), fetchImpl);
    await map.assertGrants();
    await map.assertGrants();
    expect(posts).toBe(1);
  });

  it("says nothing upstream when the customer granted nothing", async () => {
    let called = 0;
    const fetchImpl = (async () => {
      called += 1;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const map = new SwitchMap(loadConfig(base), fetchImpl);
    expect(await map.assertGrants()).toBe(false);
    expect(called).toBe(0);
  });
});
