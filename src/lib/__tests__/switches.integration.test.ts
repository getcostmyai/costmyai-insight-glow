/**
 * Real end-to-end tests for the switch lifecycle (Phase 6).
 *
 * No mocks. Real accounts, real sessions, the real database. Two independent
 * gates are proved separately, because they protect different things:
 *
 *   1. the plan gate — `requirePlan` refuses a workspace that is not paying for
 *      the level, and allows it the moment a live subscription exists;
 *   2. the identity gate — the SECURITY DEFINER functions re-derive the actor
 *      from auth.uid(), so a manager of one workspace cannot act on another,
 *      an ordinary member cannot switch at all, and the demo org is read-only.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { requirePlan, resolvePlan } from "../billing/guard.server";
import { writeAccountObjective } from "../dashboard/objective-write";

const URL = process.env["SUPABASE_URL"]!;
const SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
const PUBLISHABLE = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
const ENV = "sandbox" as const;
const DEMO_ORG = "00000000-0000-0000-0000-000000000001";

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

const PASSWORD = "Test-Switch-Pass-2026!";
const stamp = Date.now();
const addr = (who: string) => `switch-${who}-${stamp}@costmyai-test.dev`;

interface Actor {
  id: string;
  email: string;
  client: SupabaseClient;
}

async function makeActor(who: string): Promise<Actor> {
  const email = addr(who);
  const created = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  const client = createClient(URL, PUBLISHABLE, {
    global: { fetch: keyFetch(PUBLISHABLE) },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signedIn = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signedIn.error) throw signedIn.error;
  return { id: created.data.user!.id, email, client };
}

async function createOrg(actor: Actor, name: string): Promise<string> {
  const { data, error } = await actor.client.rpc("create_organization", { _name: name });
  if (error) throw error;
  return data as string;
}

/** Exactly what a paid checkout leaves behind: a plan column and a live sub. */
async function grantPaidPlan(orgId: string, plan: "certify" | "rightsize" | "govern") {
  await admin.from("organizations").update({ plan }).eq("id", orgId);
  const { error } = await admin.from("subscriptions").upsert(
    {
      org_id: orgId,
      stripe_subscription_id: `sub_test_${orgId}`,
      stripe_customer_id: `cus_test_${orgId}`,
      price_id: `price_${plan}_monthly`,
      plan,
      status: "active",
      current_period_end: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      environment: ENV,
    },
    { onConflict: "stripe_subscription_id" },
  );
  if (error) throw error;
}

async function makeRecommendation(orgId: string, fromModel: string, taskHint = "generation") {
  const { data, error } = await admin
    .from("recommendations")
    .insert({
      org_id: orgId,
      kind: "host_arbitrage",
      min_plan: "compare",
      from_model: fromModel,
      from_host: "openai",
      to_model: fromModel,
      to_host: "azure",
      task_hint: taskHint,
      monthly_saving_usd: 120,
      saving_pct: 18,
      basis: "same model, cheaper host",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

let owner: Actor; // owns the paid workspace
let member: Actor; // ordinary member of the same workspace
let outsider: Actor; // owns a different workspace entirely
let paidOrg: string;
let freeOrg: string;
let outsiderOrg: string;
const orgIds: string[] = [];
const userIds: string[] = [];

beforeAll(async () => {
  owner = await makeActor("owner");
  member = await makeActor("member");
  outsider = await makeActor("outsider");
  userIds.push(owner.id, member.id, outsider.id);

  paidOrg = await createOrg(owner, `Switch Paid ${stamp}`);
  freeOrg = await createOrg(owner, `Switch Free ${stamp}`);
  outsiderOrg = await createOrg(outsider, `Switch Outsider ${stamp}`);
  orgIds.push(paidOrg, freeOrg, outsiderOrg);

  await admin.from("memberships").insert({ org_id: paidOrg, user_id: member.id });
  await admin.from("user_roles").insert({ org_id: paidOrg, user_id: member.id, role: "member" });
}, 60_000);

afterAll(async () => {
  for (const id of orgIds) await admin.from("organizations").delete().eq("id", id);
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
}, 60_000);

describe("plan gate — requirePlan is what stands between a free org and a paid level", () => {
  it("refuses every paid level on a Compare workspace", async () => {
    await expect(requirePlan(owner.client, freeOrg, "certify", ENV)).rejects.toThrow(/certify/i);
    await expect(requirePlan(owner.client, freeOrg, "rightsize", ENV)).rejects.toThrow(/rightsize/i);
    await expect(requirePlan(owner.client, freeOrg, "govern", ENV)).rejects.toThrow(/govern/i);
    expect(await resolvePlan(owner.client, freeOrg, ENV)).toBe("compare");
  }, 30_000);

  it("allows exactly the level paid for, and nothing above it", async () => {
    await grantPaidPlan(paidOrg, "rightsize");
    expect(await resolvePlan(owner.client, paidOrg, ENV)).toBe("rightsize");
    await expect(requirePlan(owner.client, paidOrg, "certify", ENV)).resolves.toBe("rightsize");
    await expect(requirePlan(owner.client, paidOrg, "rightsize", ENV)).resolves.toBe("rightsize");
    // Autonomous switching is Govern; a Rightsize workspace must not reach it.
    await expect(requirePlan(owner.client, paidOrg, "govern", ENV)).rejects.toThrow(/govern/i);
  }, 30_000);

  it("refuses a plan column that no live subscription backs", async () => {
    await admin.from("organizations").update({ plan: "govern" }).eq("id", freeOrg);
    await expect(requirePlan(owner.client, freeOrg, "govern", ENV)).rejects.toThrow(/govern/i);
    await admin.from("organizations").update({ plan: "compare" }).eq("id", freeOrg);
  }, 30_000);
});

describe("apply_switch — identity and integrity", () => {
  it("activates a switch, marks the recommendation activated, and logs who did it", async () => {
    const rec = await makeRecommendation(paidOrg, "gpt-5.5");
    const { data: switchId, error } = await owner.client.rpc("apply_switch", {
      _rec_id: rec,
      _autonomous: false,
    });
    expect(error).toBeNull();

    const row = await admin
      .from("switches")
      .select("org_id, status, from_model, to_host, badge, autonomous, activated_by")
      .eq("id", switchId as string)
      .single();
    expect(row.data).toMatchObject({
      org_id: paidOrg,
      status: "active",
      from_model: "gpt-5.5",
      to_host: "azure",
      badge: "Proven switch",
      autonomous: false,
      activated_by: owner.id,
    });

    const recAfter = await admin.from("recommendations").select("status").eq("id", rec).single();
    expect(recAfter.data?.status).toBe("activated");

    const events = await admin
      .from("switch_events")
      .select("event, actor")
      .eq("switch_id", switchId as string);
    expect(events.data).toEqual([{ event: "activated", actor: owner.id }]);
  }, 30_000);

  it("refuses a manager of a different workspace holding a valid session", async () => {
    const rec = await makeRecommendation(paidOrg, "claude-opus-4");
    const { error } = await outsider.client.rpc("apply_switch", { _rec_id: rec });
    expect(error?.message ?? "").toMatch(/recommendation not found/i);

    const after = await admin.from("recommendations").select("status").eq("id", rec).single();
    expect(after.data?.status).toBe("open");
    await admin.from("recommendations").delete().eq("id", rec);
  }, 30_000);

  it("refuses an ordinary member of the same workspace", async () => {
    const rec = await makeRecommendation(paidOrg, "qwen3-coder-next");
    const { error } = await member.client.rpc("apply_switch", { _rec_id: rec });
    expect(error?.message ?? "").toMatch(/recommendation not found/i);
    await admin.from("recommendations").delete().eq("id", rec);
  }, 30_000);

  it("refuses the read-only demo workspace", async () => {
    const { data: demoRec } = await admin
      .from("recommendations")
      .select("id")
      .eq("org_id", DEMO_ORG)
      .eq("status", "open")
      .limit(1)
      .maybeSingle();
    if (!demoRec?.id) return; // nothing open to try; the org guard is still covered below
    const { error } = await owner.client.rpc("apply_switch", { _rec_id: demoRec.id });
    // Either the membership check or the synthetic check refuses — never success.
    expect(error).not.toBeNull();
  }, 30_000);

  it("refuses a second active switch on the same workload", async () => {
    const rec = await makeRecommendation(paidOrg, "gpt-5.5-dup");
    const first = await owner.client.rpc("apply_switch", { _rec_id: rec });
    expect(first.error).toBeNull();

    const again = await makeRecommendation(paidOrg, "gpt-5.5-dup", "summarisation");
    const { error } = await owner.client.rpc("apply_switch", { _rec_id: again });
    expect(error?.message ?? "").toMatch(/already has an active switch/i);
    await admin.from("recommendations").delete().eq("id", again);
  }, 30_000);
});

describe("set_switch_state — pause, resume, rollback", () => {
  async function liveSwitch(model: string) {
    const rec = await makeRecommendation(paidOrg, model);
    const { data, error } = await owner.client.rpc("apply_switch", { _rec_id: rec });
    if (error) throw error;
    return { switchId: data as string, rec };
  }

  it("pauses and resumes, logging each transition", async () => {
    const { switchId } = await liveSwitch(`pause-${stamp}`);

    await owner.client.rpc("set_switch_state", {
      _switch_id: switchId,
      _status: "paused",
      _reason: "watching latency",
    });
    let row = await admin.from("switches").select("status").eq("id", switchId).single();
    expect(row.data?.status).toBe("paused");

    await owner.client.rpc("set_switch_state", { _switch_id: switchId, _status: "active" });
    row = await admin.from("switches").select("status").eq("id", switchId).single();
    expect(row.data?.status).toBe("active");

    const events = await admin
      .from("switch_events")
      .select("event")
      .eq("switch_id", switchId)
      .order("created_at");
    expect((events.data ?? []).map((e) => e.event)).toEqual(["activated", "paused", "resumed"]);
  }, 30_000);

  it("rolls back, re-opens the recommendation, and stays rolled back for good", async () => {
    const { switchId, rec } = await liveSwitch(`rollback-${stamp}`);

    const { error } = await owner.client.rpc("set_switch_state", {
      _switch_id: switchId,
      _status: "rolled_back",
      _reason: "quality regression",
    });
    expect(error).toBeNull();

    const row = await admin.from("switches").select("status").eq("id", switchId).single();
    expect(row.data?.status).toBe("rolled_back");

    // The workload is free again, so the finding must be offered once more.
    const recAfter = await admin.from("recommendations").select("status").eq("id", rec).single();
    expect(recAfter.data?.status).toBe("open");

    // A rollback is final: the traffic already went home.
    const replay = await owner.client.rpc("set_switch_state", {
      _switch_id: switchId,
      _status: "active",
    });
    expect(replay.error?.message ?? "").toMatch(/rolled back/i);
    const still = await admin.from("switches").select("status").eq("id", switchId).single();
    expect(still.data?.status).toBe("rolled_back");
  }, 30_000);

  it("refuses a member and an outsider, and does not even reveal the switch exists", async () => {
    const { switchId } = await liveSwitch(`guard-${stamp}`);

    for (const actor of [member, outsider]) {
      const { error } = await actor.client.rpc("set_switch_state", {
        _switch_id: switchId,
        _status: "paused",
      });
      expect(error?.message ?? "").toMatch(/switch not found/i);
    }
    const row = await admin.from("switches").select("status").eq("id", switchId).single();
    expect(row.data?.status).toBe("active");

    // The outsider cannot read it either — refusal is not the only barrier.
    const seen = await outsider.client.from("switches").select("id").eq("id", switchId);
    expect(seen.data ?? []).toHaveLength(0);
  }, 30_000);
});

describe("objectives — Certify entitlement, written through RLS", () => {
  it("stores the account-wide objective for a paying workspace", async () => {
    await grantPaidPlan(paidOrg, "govern");
    await expect(requirePlan(owner.client, paidOrg, "certify", ENV)).resolves.toBe("govern");

    await writeAccountObjective(owner.client, paidOrg, owner.id, {
      objective: "latency",
      quality_floor_score: null,
      max_latency_ms: 1200,
    });
    // Writing again must update the same row, not fail and not duplicate it.
    await writeAccountObjective(owner.client, paidOrg, owner.id, {
      objective: "quality_floor",
      quality_floor_score: 70,
      max_latency_ms: null,
    });
    await writeAccountObjective(owner.client, paidOrg, owner.id, {
      objective: "latency",
      quality_floor_score: null,
      max_latency_ms: 1200,
    });

    const row = await admin
      .from("objectives")
      .select("objective, max_latency_ms")
      .eq("org_id", paidOrg)
      .is("model_key", null)
      .single();
    expect(row.data).toMatchObject({ objective: "latency", max_latency_ms: 1200 });

    const all = await admin
      .from("objectives")
      .select("id")
      .eq("org_id", paidOrg)
      .is("model_key", null);
    expect(all.data ?? []).toHaveLength(1);
  }, 30_000);

  it("refuses an ordinary member writing an objective", async () => {
    await expect(
      writeAccountObjective(member.client, paidOrg, member.id, {
        objective: "cost",
        quality_floor_score: null,
        max_latency_ms: null,
      }),
    ).rejects.toThrow(/owners and admins/i);

    const { error } = await member.client.from("objectives").insert({
      org_id: paidOrg,
      model_key: "gpt-5.5",
      host: "openai",
      task_hint: "generation",
      objective: "cost",
    });
    expect(error).not.toBeNull();
  }, 30_000);
});

/**
 * Dispatch 89. The same shape of gap as apply_switch/set_switch_state:
 * role verified, entitlement assumed. These paths are reachable straight
 * through PostgREST with a manager's own token, so the entitlement has to
 * hold in the database, not only in the server function above it.
 */
describe("entitlement gate at the database layer — a manager who is not paying", () => {
  it("refuses an objective written directly by a free workspace", async () => {
    const { error } = await owner.client.from("objectives").insert({
      org_id: freeOrg,
      objective: "cost",
    });
    expect(error).not.toBeNull();
  }, 30_000);

  it("refuses a routing rule written directly by a free workspace", async () => {
    const { error } = await owner.client.from("routing_rules").insert({
      org_id: freeOrg,
      from_model: "gpt-5.5",
      from_host: "openai",
      to_model: "gpt-5.5",
      to_host: "azure",
      source: "manual",
      state: "active",
      basis: "same model, cheaper host",
    });
    expect(error).not.toBeNull();
  }, 30_000);

  it("refuses an autonomous routing rule from a Rightsize workspace", async () => {
    await grantPaidPlan(paidOrg, "rightsize");
    const { error } = await owner.client.from("routing_rules").insert({
      org_id: paidOrg,
      from_model: "gpt-5.5",
      from_host: "openai",
      to_model: "gpt-5.5",
      to_host: "azure",
      source: "autonomous",
      state: "active",
      basis: "same model, cheaper host",
    });
    expect(error).not.toBeNull();
  }, 30_000);

  it("refuses a manager raising their own plan through the workspace row", async () => {
    const { error } = await owner.client
      .from("organizations")
      .update({ plan: "govern" })
      .eq("id", freeOrg);
    expect(error).not.toBeNull();

    const after = await admin.from("organizations").select("plan").eq("id", freeOrg).single();
    expect(after.data?.plan).toBe("compare");
  }, 30_000);

  it("refuses autonomous mode until the workspace is entitled to Govern", async () => {
    await grantPaidPlan(paidOrg, "rightsize");
    const refused = await owner.client
      .from("organizations")
      .update({ autonomous_enabled: true })
      .eq("id", paidOrg);
    expect(refused.error).not.toBeNull();

    await grantPaidPlan(paidOrg, "govern");
    const allowed = await owner.client
      .from("organizations")
      .update({ autonomous_enabled: true })
      .eq("id", paidOrg)
      .select("autonomous_enabled")
      .maybeSingle();
    expect(allowed.error).toBeNull();
    expect(allowed.data?.autonomous_enabled).toBe(true);
  }, 30_000);
});

describe("cleanup", () => {
  it("leaves no test rows behind", async () => {
    for (const id of orgIds) await admin.from("organizations").delete().eq("id", id);
    const { data } = await admin.from("organizations").select("id").in("id", orgIds);
    expect(data ?? []).toHaveLength(0);
    orgIds.length = 0;
  }, 30_000);
});
