/**
 * Dispatch 155, Stage 5 — auto-pause, proven against the real database and the
 * real public route.
 *
 * The claim being tested is narrow and load-bearing: a switch that keeps
 * sending traffic straight back where it came from stops running on its own,
 * the workspace can read why, and a container cannot pause anybody else's
 * switch by naming its id.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { INGEST_PATHS } from "@/lib/ingest/contract";
import { AUTO_PAUSE_THRESHOLD } from "@/lib/ingest/fallback.server";
import { mintApiKey } from "@/lib/ingest/keys.server";

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
const PASSWORD = "Test-Fallback-Pause-2026!";
const POST_URL = `${APP}${INGEST_PATHS.switches}`;

let ownerId: string;
let orgId: string;
let otherOrgId: string;
let otherOwnerId: string;
let token: string;
let switchId: string;
let otherSwitchId: string;
let ownerClient: SupabaseClient;

async function report(body: unknown, bearer = token): Promise<Response> {
  return fetch(POST_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const fallback = (id: string, n: number) => ({
  switch_id: id,
  reason: "model_not_found" as const,
  status_code: 404,
  model_key: "openai/gpt-4.1-mini",
  host: "api.openai.com",
  occurred_at: new Date().toISOString(),
  idempotency_key: `d155-stage5-${stamp}-${n}`,
});

async function makeOrg(prefix: string): Promise<{ userId: string; orgId: string; client: SupabaseClient }> {
  const email = `${prefix}-${stamp}@costmyai-test.dev`;
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (created.error) throw created.error;
  const client = createClient(URL, PUBLISHABLE, {
    global: { fetch: keyFetch(PUBLISHABLE) },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signedIn = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signedIn.error) throw signedIn.error;
  const { data, error } = await client.rpc("create_organization", { _name: `Fallback ${prefix} ${stamp}` });
  if (error) throw error;
  return { userId: created.data.user!.id, orgId: data as string, client };
}

async function makeSwitch(org: string): Promise<string> {
  const { data, error } = await admin
    .from("switches")
    .insert({
      org_id: org,
      from_model: "openai/gpt-4o-mini",
      from_host: "openai",
      to_model: "openai/gpt-4.1-mini",
      to_host: "openai",
      basis: "rightsize",
      autonomous: false,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

beforeAll(async () => {
  const mine = await makeOrg("fallback-owner");
  ownerId = mine.userId;
  orgId = mine.orgId;
  ownerClient = mine.client;
  const theirs = await makeOrg("fallback-other");
  otherOwnerId = theirs.userId;
  otherOrgId = theirs.orgId;

  token = (await mintApiKey(orgId, "Fallback test", ownerId)).token;
  switchId = await makeSwitch(orgId);
  otherSwitchId = await makeSwitch(otherOrgId);
}, 60_000);

afterAll(async () => {
  for (const org of [orgId, otherOrgId]) {
    await admin.from("switch_fallbacks").delete().eq("org_id", org);
    await admin.from("switch_events").delete().eq("org_id", org);
    // Rerouted events name their switch through route_reason (FK, NO ACTION);
    // they must be cleared before the switch they point at.
    await admin.from("usage_events").delete().eq("org_id", org);
    await admin.from("usage_rollups").delete().eq("org_id", org);
    await admin.from("switches").delete().eq("org_id", org);
  }
  await admin.from("sync_runs").delete().eq("job", "switch-auto-pause").contains("detail", { orgId });
  await admin.auth.admin.deleteUser(ownerId);
  await admin.auth.admin.deleteUser(otherOwnerId);
}, 60_000);

describe("a switch that keeps falling back pauses itself", () => {
  it("stays live below the threshold", async () => {
    const res = await report({ v: 2, fallbacks: [fallback(switchId, 1), fallback(switchId, 2)] });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ recorded: 2, paused: [] });

    const { data } = await admin.from("switches").select("status").eq("id", switchId).single();
    expect(data!.status).toBe("active");
  });

  it("pauses on the third, and says why where the customer reads it", async () => {
    expect(AUTO_PAUSE_THRESHOLD).toBe(3);
    const res = await report({ v: 2, fallbacks: [fallback(switchId, 3)] });
    expect(res.status).toBe(200);
    expect((await res.json()).paused).toEqual([switchId]);

    const { data } = await admin.from("switches").select("status").eq("id", switchId).single();
    expect(data!.status).toBe("paused");

    // The reason is a real event row, readable by the workspace's own members.
    const { data: events } = await ownerClient
      .from("switch_events")
      .select("event, detail")
      .eq("switch_id", switchId)
      .eq("event", "auto_paused");
    expect(events).toHaveLength(1);
    expect(events![0]!.detail).toContain("does not know that model");
    expect(events![0]!.detail).toContain("openai/gpt-4o-mini");

    // And it is on the ops board.
    const { data: runs } = await admin
      .from("sync_runs")
      .select("job, detail")
      .eq("job", "switch-auto-pause")
      .order("started_at", { ascending: false })
      .limit(5);
    expect(runs!.some((r) => (r.detail as Record<string, unknown>)["switchId"] === switchId)).toBe(true);
  });

  it("is idempotent — a replayed batch neither double-counts nor re-pauses", async () => {
    const res = await report({ v: 2, fallbacks: [fallback(switchId, 3)] });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ recorded: 0, paused: [] });

    const { count } = await admin
      .from("switch_fallbacks")
      .select("id", { count: "exact", head: true })
      .eq("switch_id", switchId);
    expect(count).toBe(3);
  });
});

describe("a container can only ever pause its own workspace's switches", () => {
  it("silently ignores a switch id belonging to someone else", async () => {
    const res = await report({
      v: 2,
      fallbacks: [1, 2, 3, 4].map((n) => ({
        ...fallback(otherSwitchId, 100 + n),
        switch_id: otherSwitchId,
      })),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ recorded: 0, paused: [] });

    const { data } = await admin.from("switches").select("status").eq("id", otherSwitchId).single();
    expect(data!.status).toBe("active");
    const { count } = await admin
      .from("switch_fallbacks")
      .select("id", { count: "exact", head: true })
      .eq("switch_id", otherSwitchId);
    expect(count).toBe(0);
  });

  it("refuses an unauthenticated report outright", async () => {
    const res = await report({ v: 2, fallbacks: [fallback(switchId, 999)] }, "cma_live_not_a_real_token");
    expect(res.status).toBe(401);
  });

  it("refuses a malformed report rather than guessing", async () => {
    const res = await report({ v: 2, fallbacks: [{ switch_id: switchId, reason: "because_i_said_so" }] });
    expect(res.status).toBe(422);
  });
});
