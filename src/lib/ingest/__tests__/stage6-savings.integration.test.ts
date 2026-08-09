/**
 * Dispatch 155, Stage 6 — the headline number becomes an observation.
 *
 * This is the proof that closes Dispatch 150/151. Nothing below the HTTP
 * boundary is faked: the real container proxy rewrites a real request, the real
 * public ingest route stores the resulting v2 event in the real database, and
 * `switches.saved_usd` is then computed from those stored events and the real
 * `host_prices` rows — and reconciled, to the cent, against the dashboard tile
 * a customer actually reads.
 *
 * The bar is a genuinely non-zero, independently recomputed number. An absence
 * of errors would prove nothing here, because a saving of zero is exactly what
 * the broken version produced.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { INGEST_PATHS } from "@/lib/ingest/contract";
import { mintApiKey } from "@/lib/ingest/keys.server";
import type { SwitchPlan, SwitchPlanEntry } from "@/lib/ingest/switch-plan";
import { buildDashboardSnapshot } from "@/lib/dashboard.server";
import { computeSwitchSavings } from "@/lib/switching/savings.server";
import { assertRoutingGrants } from "@/lib/ingest/routing.server";

import { loadConfig } from "../../../../packages/gateway-container/src/config";
import { handleProxy, type ProxyEvent } from "../../../../packages/gateway-container/src/proxy";
import type { QueueItem, UpstreamQueue } from "../../../../packages/gateway-container/src/queue";
import { SwitchMap } from "../../../../packages/gateway-container/src/switch-map";

import { guardIntegrationDatabase } from "../../__tests__/support/isolation";

const URL = process.env["SUPABASE_URL"]!;
const SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
const PUBLISHABLE = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
const APP = process.env["CONNECTOR_TEST_APP_URL"] ?? "http://localhost:8080";
const UPSTREAM = "https://api.openai.com";

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
const PASSWORD = "Test-Stage6-Savings-2026!";
const EVENTS_URL = `${APP}${INGEST_PATHS.events}`;

/** The pair under test, priced in the live catalogue, not by this test. */
const FROM_MODEL = "openai/gpt-4o";
const TO_MODEL = "openai/gpt-4o-mini";
const HOST = "openai";
/** What a real OpenAI client sends and a real container reports. */
const WIRE_FROM = "gpt-4o";
const WIRE_TO = "gpt-4o-mini";
const WIRE_HOST = "api.openai.com";

const INPUT_TOKENS = 12_000;
const OUTPUT_TOKENS = 3_000;
const CALLS = 3;

let ownerId: string;
let orgId: string;
let ownerClient: SupabaseClient;
let token: string;
let switchId: string;
let otherOrgId: string;
let otherOwnerId: string;
let otherSwitchId: string;

/** Recomputed here from the live price rows — never a constant copied into the test. */
let expectedSavedUsd = 0;
let expectedCounterfactual = 0;
let expectedActual = 0;

function config() {
  return loadConfig({
    COSTMYAI_INGEST_TOKEN: token,
    COSTMYAI_UPSTREAM_URL: UPSTREAM,
    COSTMYAI_SPOOL_DIR: `/tmp/costmyai-d155-stage6-${stamp}`,
  });
}

function collector() {
  const events: ProxyEvent[] = [];
  const queue = {
    enqueue(item: QueueItem) {
      for (const e of (item.body as { events?: ProxyEvent[] }).events ?? []) events.push(e);
    },
  } as unknown as UpstreamQueue;
  return { events, queue };
}

/** A real SwitchMap, filled through its real poll + parse path. */
async function switchMapFor(id: string): Promise<SwitchMap> {
  const switchEntry: SwitchPlanEntry = {
    id,
    phase: 1,
    match: { model_keys: [WIRE_FROM], hosts: [WIRE_HOST, HOST] },
    target: { model_key: WIRE_TO, host: WIRE_HOST },
    gate: "connected",
    executable: true,
    needs_confirmation: false,
  };
  const plan: SwitchPlan = {
    v: 1,
    org_id: orgId,
    generated_at: new Date().toISOString(),
    poll_interval_ms: 60_000,
    switches: [switchEntry],
  };
  const map = new SwitchMap(config(), (async () =>
    new Response(JSON.stringify(plan), { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch);
  expect(await map.refresh()).toBe(true);
  return map;
}

/** An upstream that answers like OpenAI does, with real token counts. */
function upstream() {
  const fetchImpl = (async () =>
    new Response(
      JSON.stringify({
        model: WIRE_TO,
        usage: { prompt_tokens: INPUT_TOKENS, completion_tokens: OUTPUT_TOKENS },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as unknown as typeof fetch;
  return fetchImpl;
}

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
  const { data, error } = await client.rpc("create_organization", { _name: `${prefix} ${stamp}` });
  if (error) throw error;
  return { userId: created.data.user!.id, orgId: data as string, client };
}

async function activeSwitch(org: string): Promise<string> {
  const { data, error } = await admin
    .from("switches")
    .insert({
      org_id: org,
      from_model: FROM_MODEL,
      from_host: HOST,
      to_model: TO_MODEL,
      to_host: HOST,
      basis: "same model, cheaper host",
      autonomous: false,
      status: "active",
      activated_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    })
    .select("id, saved_usd")
    .single();
  if (error) throw error;
  // The starting point of the whole claim: nothing saved until traffic moves.
  expect(Number(data.saved_usd)).toBe(0);
  return data.id;
}

beforeAll(async () => {
  const owner = await makeOrg("stage6-savings");
  ownerId = owner.userId;
  orgId = owner.orgId;
  ownerClient = owner.client;
  token = (await mintApiKey(orgId, "Stage 6 savings proof", ownerId)).token;
  switchId = await activeSwitch(orgId);
  /**
   * Dispatch 161 made accrual conditional on the switch being executable under
   * its own gate, so the fixture has to write the artefact a real customer
   * writes — a connected row for the destination host, through the same
   * `assertRoutingGrants` a container calls. Without it the server is right to
   * refuse the money, and the proof would be measuring the refusal.
   */
  await assertRoutingGrants(orgId, [HOST], "stage6-container");

  const other = await makeOrg("stage6-other");
  otherOwnerId = other.userId;
  otherOrgId = other.orgId;
  otherSwitchId = await activeSwitch(otherOrgId);

  // The expected number, derived from the live catalogue at run time.
  const { data: prices, error } = await admin
    .from("host_prices")
    .select("model_key, input_usd_per_mtok, output_usd_per_mtok")
    .eq("host", HOST)
    .eq("is_fixture", false)
    .in("model_key", [FROM_MODEL, TO_MODEL]);
  if (error) throw error;
  const price = (key: string) => {
    const row = prices!.find((p) => p.model_key === key)!;
    return { inp: Number(row.input_usd_per_mtok), out: Number(row.output_usd_per_mtok) };
  };
  const before = price(FROM_MODEL);
  const after = price(TO_MODEL);
  const cost = (p: { inp: number; out: number }) =>
    (INPUT_TOKENS / 1e6) * p.inp + (OUTPUT_TOKENS / 1e6) * p.out;
  expectedCounterfactual = Math.round(cost(before) * CALLS * 100) / 100;
  expectedActual = Math.round(cost(after) * CALLS * 100) / 100;
  expectedSavedUsd = Math.round((expectedCounterfactual - expectedActual) * 100) / 100;
  // If the catalogue ever prices these two identically the test would pass on a
  // zero, which is precisely the failure it exists to catch.
  expect(expectedSavedUsd).toBeGreaterThan(0.05);
}, 90_000);

afterAll(async () => {
  for (const org of [orgId, otherOrgId]) {
    await admin.from("usage_events").delete().eq("org_id", org);
    await admin.from("usage_rollups").delete().eq("org_id", org);
    await admin.from("switches").delete().eq("org_id", org);
    await admin.from("api_keys").delete().eq("org_id", org);
    await admin.from("organizations").delete().eq("id", org);
  }
  await admin.auth.admin.deleteUser(ownerId);
  await admin.auth.admin.deleteUser(otherOwnerId);
}, 90_000);

describe("Stage 6 — a real rerouted call, priced from what really happened", () => {
  let disclosure: Record<string, string> = {};

  it("reroutes real calls, discloses it on the caller's own response, and is accepted by ingest", async () => {
    const { events, queue } = collector();
    const map = await switchMapFor(switchId);

    for (let i = 0; i < CALLS; i++) {
      const response = await handleProxy(
        new Request(`http://localhost:8787/v1/chat/completions`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: "Bearer sk-customer-key" },
          body: JSON.stringify({ model: WIRE_FROM, messages: [{ role: "user", content: "hello" }] }),
        }),
        { config: config(), queue, fetchImpl: upstream(), switchMap: map },
      );
      await response.text();
      if (i === 0) {
        disclosure = Object.fromEntries(
          [...response.headers.entries()].filter(([k]) => k.startsWith("x-costmyai-")),
        );
      }
    }
    await new Promise((r) => setTimeout(r, 50));

    // Header-verified: the caller can see, on their own response, that the
    // request they sent is not the request that ran.
    expect(disclosure).toEqual({
      "x-costmyai-reroute": "applied",
      "x-costmyai-switch": switchId,
      "x-costmyai-original-model": WIRE_FROM,
      "x-costmyai-original-host": WIRE_HOST,
      "x-costmyai-model": WIRE_TO,
      "x-costmyai-host": WIRE_HOST,
    });

    expect(events).toHaveLength(CALLS);
    const batch = {
      v: 2 as const,
      events: events.map((e, i) => ({ ...e, idempotency_key: `stage6-${stamp}-${i}` })),
    };
    const res = await fetch(EVENTS_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(batch),
    });
    expect(res.status).toBe(200);
    const result = (await res.json()) as { accepted: number; switchesRepriced: number };
    expect(result.accepted).toBe(CALLS);
    // The savings write happened in the same request that reported the traffic.
    expect(result.switchesRepriced).toBe(1);
  }, 90_000);

  it("stores the rerouting evidence on the events themselves", async () => {
    const { data, error } = await admin
      .from("usage_events")
      .select("model_key, host, rerouted, original_model_key, original_host, route_reason, input_tokens, output_tokens, status")
      .eq("org_id", orgId);
    if (error) throw error;
    expect(data).toHaveLength(CALLS);
    for (const e of data!) {
      expect(e.rerouted).toBe(true);
      expect(e.model_key).toBe(WIRE_TO);
      expect(e.original_model_key).toBe(WIRE_FROM);
      expect(e.original_host).toBe(WIRE_HOST);
      expect(e.route_reason).toBe(switchId);
      expect(e.status).toBe("ok");
      expect(e.input_tokens).toBe(INPUT_TOKENS);
      expect(e.output_tokens).toBe(OUTPUT_TOKENS);
    }
  });

  it("computes a non-zero saved_usd that matches the live catalogue to the cent", async () => {
    const computed = await computeSwitchSavings(admin as never, orgId);
    expect(computed).toHaveLength(1);
    const row = computed[0]!;
    expect(row.switchId).toBe(switchId);
    expect(row.events).toBe(CALLS);
    expect(row.unpricedEvents).toBe(0);
    expect(row.counterfactualUsd).toBeCloseTo(expectedCounterfactual, 2);
    expect(row.actualUsd).toBeCloseTo(expectedActual, 2);
    expect(row.savedUsd).toBeCloseTo(expectedSavedUsd, 2);
    expect(row.savedUsd).toBeGreaterThan(0);

    const { data } = await admin.from("switches").select("saved_usd").eq("id", switchId).single();
    expect(Number(data!.saved_usd)).toBeCloseTo(expectedSavedUsd, 2);
  }, 60_000);

  it("reconciles to the dashboard tile the customer reads", async () => {
    const snapshot = await buildDashboardSnapshot({
      days: 30,
      orgId,
      client: ownerClient as never,
    });
    expect(snapshot.savings.savedToDate).toBeCloseTo(expectedSavedUsd, 2);
    expect(snapshot.savings.captured).toBeGreaterThan(0);
    const tile = snapshot.activeSwitches.find((s) => s.switchId === switchId)!;
    expect(tile.saved).toBeCloseTo(expectedSavedUsd, 2);

    // Printed, not merely asserted: the figure this whole arc exists to make real.
    const { data: stored } = await admin.from("switches").select("saved_usd").eq("id", switchId).single();
    console.log(
      [
        "--- Stage 6 ledger (all figures computed at run time) ---",
        `traffic            : ${CALLS} rerouted calls, ${INPUT_TOKENS} in / ${OUTPUT_TOKENS} out each`,
        `counterfactual     : $${expectedCounterfactual.toFixed(2)}  (${FROM_MODEL} @ ${HOST})`,
        `actually served    : $${expectedActual.toFixed(2)}  (${TO_MODEL} @ ${HOST})`,
        `saved_usd stored   : $${Number(stored!.saved_usd).toFixed(2)}`,
        `switch tile        : $${tile.saved.toFixed(2)}`,
        `savedToDate tile   : $${snapshot.savings.savedToDate.toFixed(2)}`,
      ].join("\n"),
    );
  }, 90_000);


  it("credits nothing to a switch in another workspace", async () => {
    const other = await computeSwitchSavings(admin as never, otherOrgId);
    expect(other).toHaveLength(0);
    const { data } = await admin.from("switches").select("saved_usd").eq("id", otherSwitchId).single();
    expect(Number(data!.saved_usd)).toBe(0);
  }, 60_000);

  it("is idempotent — the same batch replayed does not double the saving", async () => {
    const { events, queue } = collector();
    const map = await switchMapFor(switchId);
    const response = await handleProxy(
      new Request(`http://localhost:8787/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer sk-customer-key" },
        body: JSON.stringify({ model: WIRE_FROM, messages: [{ role: "user", content: "hello" }] }),
      }),
      { config: config(), queue, fetchImpl: upstream(), switchMap: map },
    );
    await response.text();
    await new Promise((r) => setTimeout(r, 50));

    // Replayed under a key already used: a retried push must not pay twice.
    const res = await fetch(EVENTS_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ v: 2, events: [{ ...events[0]!, idempotency_key: `stage6-${stamp}-0` }] }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { accepted: number }).accepted).toBe(0);

    const { data } = await admin.from("switches").select("saved_usd").eq("id", switchId).single();
    expect(Number(data!.saved_usd)).toBeCloseTo(expectedSavedUsd, 2);
  }, 90_000);
});
