/**
 * Dispatch 155, Stage 2 — the control channel, proven end to end.
 *
 * Nothing below the HTTP boundary is mocked: a real workspace, a real ingest
 * token, the real public route on the running server, and the real database
 * behind it. What is proven here is the whole point of the stage — a container
 * asks one question and gets back match keys, gate state and a yes/no it did
 * not have to derive for itself.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { INGEST_PATHS } from "@/lib/ingest/contract";
import { mintApiKey } from "@/lib/ingest/keys.server";
import type { SwitchPlan } from "@/lib/ingest/switch-plan";

import { guardIntegrationDatabase } from "../../__tests__/support/isolation";

const URL = process.env["SUPABASE_URL"]!;
const SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
const PUBLISHABLE = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
const APP = process.env["CONNECTOR_TEST_APP_URL"] ?? "http://localhost:8080";

function keyFetch(key: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));
    if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
}

const admin = createClient(URL, SERVICE, {
  global: { fetch: keyFetch(SERVICE) },
  auth: { persistSession: false, autoRefreshToken: false },
});

guardIntegrationDatabase(admin);

const stamp = Date.now();
const PASSWORD = "Test-Switchplan-Pass-2026!";
const PLAN_URL = `${APP}${INGEST_PATHS.switches}`;

let ownerId: string;
let orgId: string;
let token: string;
let ownerClient: SupabaseClient;
let sameHostSwitchId: string;
let crossSwitchId: string;

async function plan(): Promise<SwitchPlan> {
  const res = await fetch(PLAN_URL, { headers: { authorization: `Bearer ${token}` } });
  expect(res.status).toBe(200);
  return (await res.json()) as SwitchPlan;
}

const entry = (p: SwitchPlan, id: string) => p.switches.find((s) => s.id === id)!;

beforeAll(async () => {
  const email = `switchplan-${stamp}@costmyai-test.dev`;
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (created.error) throw created.error;
  ownerId = created.data.user!.id;
  ownerClient = createClient(URL, PUBLISHABLE, {
    global: { fetch: keyFetch(PUBLISHABLE) },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signedIn = await ownerClient.auth.signInWithPassword({ email, password: PASSWORD });
  if (signedIn.error) throw signedIn.error;
  const { data, error } = await ownerClient.rpc("create_organization", {
    _name: `Switch Plan Test ${stamp}`,
  });
  if (error) throw error;
  orgId = data as string;
  token = (await mintApiKey(orgId, "Switch plan test", ownerId)).token;

  // Real observed traffic to openai, and none at all to together — the two
  // sides of the connection signal, established the way a customer does it.
  const day = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10);
  // Two distinct workloads, because a workspace may hold only one active switch
  // per (model, host) — the same invariant the database enforces.
  const rollup = await admin.from("usage_rollups").insert([
    {
      org_id: orgId,
      granularity: "day",
      bucket_start: `${day}T00:00:00+00:00`,
      model_key: "openai/gpt-4o-mini",
      host: "openai",
      task_hint: "unknown",
      requests: 12,
      input_tokens: 1200,
      output_tokens: 300,
      cost_usd: 0.01,
      is_synthetic: true,
    },
    {
      org_id: orgId,
      granularity: "day",
      bucket_start: `${day}T00:00:00+00:00`,
      model_key: "openai/gpt-4o",
      host: "openai",
      task_hint: "unknown",
      requests: 9,
      input_tokens: 2400,
      output_tokens: 600,
      cost_usd: 0.04,
      is_synthetic: true,
    },
  ]);
  if (rollup.error) throw rollup.error;

  const switches = await admin
    .from("switches")
    .insert([
      {
        org_id: orgId,
        from_model: "openai/gpt-4o-mini",
        from_host: "openai",
        to_model: "openai/gpt-4.1-mini",
        to_host: "openai",
        basis: "rightsize",
        autonomous: false,
        is_synthetic: true,
      },
      {
        org_id: orgId,
        from_model: "openai/gpt-4o",
        from_host: "openai",
        to_model: "openai/gpt-4o",
        to_host: "together",
        autonomous: false,
        is_synthetic: true,
      },
    ])
    .select("id, to_host");
  if (switches.error) throw switches.error;
  sameHostSwitchId = switches.data.find((s) => s.to_host === "openai")!.id;
  crossSwitchId = switches.data.find((s) => s.to_host === "together")!.id;
}, 60_000);

afterAll(async () => {
  await admin.from("org_provider_routing").delete().eq("org_id", orgId);
  await admin.from("switches").delete().eq("org_id", orgId);
  await admin.from("usage_rollups").delete().eq("org_id", orgId);
  await admin.from("organizations").delete().eq("id", orgId);
  await admin.auth.admin.deleteUser(ownerId);
}, 60_000);

describe("switch plan endpoint", () => {
  it("refuses an unknown token and leaks nothing", async () => {
    const res = await fetch(PLAN_URL, { headers: { authorization: "Bearer not-a-real-token-000000" } });
    expect(res.status).toBe(401);
    expect(JSON.stringify(await res.json())).not.toContain(orgId);
  });

  it("ships resolved match keys the container never has to derive", async () => {
    const p = await plan();
    expect(p.v).toBe(1);
    expect(p.org_id).toBe(orgId);
    expect(p.poll_interval_ms).toBeGreaterThan(0);

    const same = entry(p, sameHostSwitchId);
    expect(same.match.model_keys).toContain("openai/gpt-4o-mini");
    // The curated hostname map, resolved here, not in the customer's container.
    expect(same.match.hosts).toContain("openai");
    expect(same.match.hosts).toContain("api.openai.com");
    expect(same.target).toEqual({ model_key: "openai/gpt-4.1-mini", host: "openai" });
  });

  it("makes a same-host model swap executable on observed traffic alone", async () => {
    const same = entry(await plan(), sameHostSwitchId);
    expect(same.phase).toBe(1);
    expect(same.gate).toBe("connected");
    expect(same.executable).toBe(true);
  });

  it("refuses a cross-provider switch to a provider never seen", async () => {
    const cross = entry(await plan(), crossSwitchId);
    expect(cross.phase).toBe(2);
    expect(cross.gate).toBe("not_connected");
    expect(cross.executable).toBe(false);
    expect(cross.blocked_reason).toBe("provider_not_connected");
  });

  it("still refuses it once connected but not granted", async () => {
    const day = new Date().toISOString().slice(0, 10);
    const seeded = await admin.from("usage_rollups").insert({
      org_id: orgId,
      granularity: "day",
      bucket_start: `${day}T00:00:00+00:00`,
      model_key: "openai/gpt-4o",
      host: "together",
      task_hint: "unknown",
      requests: 3,
      input_tokens: 300,
      output_tokens: 90,
      cost_usd: 0.001,
    });
    if (seeded.error) throw seeded.error;

    const cross = entry(await plan(), crossSwitchId);
    expect(cross.gate).toBe("connected");
    expect(cross.executable).toBe(false);
    expect(cross.blocked_reason).toBe("routing_not_granted");
  });

  it("becomes executable only after the container asserts a real grant", async () => {
    const res = await fetch(PLAN_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ v: 2, hosts: ["together"], container_id: "test-container" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ granted: ["together"] });

    const cross = entry(await plan(), crossSwitchId);
    expect(cross.gate).toBe("granted");
    expect(cross.executable).toBe(true);
    expect(cross.blocked_reason).toBeUndefined();
  });

  it("rejects a grant assertion carrying anything resembling a credential", async () => {
    const res = await fetch(PLAN_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ v: 2, hosts: ["together"], api_key: "sk-live-should-never-arrive" }),
    });
    expect(res.status).toBe(422);
  });

  it("stops being executable the moment the grant is revoked", async () => {
    const { revokeRoutingGrant } = await import("@/lib/ingest/routing.server");
    await revokeRoutingGrant(orgId, "together");

    const cross = entry(await plan(), crossSwitchId);
    expect(cross.gate).toBe("connected");
    expect(cross.executable).toBe(false);
    expect(cross.blocked_reason).toBe("routing_not_granted");
  });
});

describe("container poll loop, against the real endpoint (Stage 3)", () => {
  it("polls the live plan, then survives the endpoint disappearing", async () => {
    const { loadConfig } = await import("../../../../packages/gateway-container/src/config");
    const { SwitchMap, STALE_AFTER_MS } = await import(
      "../../../../packages/gateway-container/src/switch-map"
    );

    const cfg = (base: string) =>
      loadConfig({
        COSTMYAI_INGEST_TOKEN: token,
        COSTMYAI_BASE_URL: base,
        COSTMYAI_UPSTREAM_URL: "https://api.openai.com",
        COSTMYAI_SPOOL_DIR: "/tmp/costmyai-stage3-live",
      });

    // Make the same-host switch executable, so there is a real decision to lose.
    await admin.from("switches").update({ status: "active" }).eq("id", sameHostSwitchId);

    let now = Date.now();
    const live = new SwitchMap(cfg(APP), fetch, () => now);
    expect(await live.refresh()).toBe(true);
    expect(live.status().active).toBe(true);
    const hit = live.lookup("openai/gpt-4o-mini", "api.openai.com");
    expect(hit?.target.model_key).toBe("openai/gpt-4.1-mini");

    // CostMyAI becomes unreachable. Nothing about the customer's traffic changes
    // until we can no longer vouch for the decision, and then it stops.
    const dead = new SwitchMap(cfg("http://127.0.0.1:9"), fetch, () => now);
    expect(await dead.refresh()).toBe(false);
    expect(dead.lookup("openai/gpt-4o-mini", "openai")).toBeNull();

    now += STALE_AFTER_MS + 1;
    expect(live.lookup("openai/gpt-4o-mini", "openai")).toBeNull();
    expect(live.status().stale).toBe(true);
  }, 60_000);
});
