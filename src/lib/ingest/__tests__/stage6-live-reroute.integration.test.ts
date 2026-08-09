/**
 * Dispatch 155, Stage 6 (live half) — a real rerouted call, no stub anywhere.
 *
 * The priced half of Stage 6 lives in `stage6-savings.integration.test.ts`,
 * where the upstream is a stand-in so the token counts can be pinned and the
 * money checked to the cent. This file removes the last stand-in: a real
 * container, polling a real plan built by the real server from a real row in
 * `switches`, rewrites a real request to a real hosted inference API, which
 * really serves the cheaper model and returns its own usage counters.
 *
 * What it proves, and what it deliberately does not:
 *  - proves: the rewrite, the disclosure headers, and the reroute provenance
 *    on the stored event are real against a live provider;
 *  - does not prove pricing, because this endpoint is an aggregator we do not
 *    carry price rows for. The savings engine is asserted to say exactly that
 *    — the event is counted as UNPRICED rather than valued at a guess. A
 *    saving we cannot source is not a saving we will show.
 *
 * Skips loudly without a provider credential rather than degrading to a mock.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { mintApiKey } from "@/lib/ingest/keys.server";
import { buildSwitchPlan } from "@/lib/ingest/switch-plan.server";
import { computeSwitchSavings } from "@/lib/switching/savings.server";

import { loadConfig } from "../../../../packages/gateway-container/src/config";
import { createGateway } from "../../../../packages/gateway-container/src/index";
import { guardIntegrationDatabase } from "../../__tests__/support/isolation";

const URL_ = process.env["SUPABASE_URL"]!;
const SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
const PUBLISHABLE = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
const APP = process.env["CONNECTOR_TEST_APP_URL"] ?? "http://localhost:8080";

/** A real, live inference endpoint. Not a stub, not a fixture, not localhost. */
const PROVIDER_URL = "https://ai.gateway.lovable.dev";
const PROVIDER_KEY = process.env["LOVABLE_API_KEY"];
/** The hostname a real container reports for that endpoint. */
const WIRE_HOST = "ai.gateway.lovable.dev";
const FROM_MODEL = "google/gemini-2.5-flash";
const TO_MODEL = "google/gemini-2.5-flash-lite";

const PASSWORD = "Test-Stage6-Live-2026!";
const PORT = 8793;
const stamp = Date.now();

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

const admin = createClient(URL_, SERVICE, {
  global: { fetch: keyFetch(SERVICE) },
  auth: { persistSession: false, autoRefreshToken: false },
});
guardIntegrationDatabase(admin);

let ownerId: string;
let orgId: string;
let ownerClient: SupabaseClient;
let switchId: string;
let gateway: ReturnType<typeof createGateway>;

const live = PROVIDER_KEY ? describe : describe.skip;

async function flushMetered(expected: number): Promise<void> {
  for (let i = 0; i < 200 && gateway.queue.size < expected; i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  await gateway.flush();
}

beforeAll(async () => {
  if (!PROVIDER_KEY) return;
  const email = `stage6-live-${stamp}@costmyai-test.dev`;
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (created.error) throw created.error;
  ownerId = created.data.user!.id;
  ownerClient = createClient(URL_, PUBLISHABLE, {
    global: { fetch: keyFetch(PUBLISHABLE) },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signedIn = await ownerClient.auth.signInWithPassword({ email, password: PASSWORD });
  if (signedIn.error) throw signedIn.error;
  const { data: org, error: orgError } = await ownerClient.rpc("create_organization", {
    _name: `Stage 6 Live ${stamp}`,
  });
  if (orgError) throw orgError;
  orgId = org as string;

  // Signal 1 of the gate, honestly: this workspace has really sent traffic to
  // this provider before. Seeded as a rollup, which is where the gate reads it.
  const day = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const { error: rollupError } = await admin.from("usage_rollups").insert({
    org_id: orgId,
    bucket_start: `${day}T00:00:00Z`,
    granularity: "day",
    model_key: FROM_MODEL,
    host: WIRE_HOST,
    task_hint: "unknown",
    requests: 1,
    input_tokens: 100,
    output_tokens: 100,
    cost_usd: 0,
  });
  if (rollupError) throw rollupError;

  const { data: sw, error: swError } = await admin
    .from("switches")
    .insert({
      org_id: orgId,
      from_model: FROM_MODEL,
      from_host: WIRE_HOST,
      to_model: TO_MODEL,
      to_host: WIRE_HOST,
      basis: "same host, cheaper model",
      autonomous: false,
      status: "active",
    })
    .select("id")
    .single();
  if (swError) throw swError;
  switchId = sw.id;

  const token = (await mintApiKey(orgId, "Stage 6 live reroute", ownerId)).token;
  gateway = createGateway(
    loadConfig({
      COSTMYAI_INGEST_TOKEN: token,
      COSTMYAI_UPSTREAM_URL: PROVIDER_URL,
      COSTMYAI_BASE_URL: APP,
      COSTMYAI_SPOOL_DIR: mkdtempSync(join(tmpdir(), "costmyai-stage6-live-")),
      COSTMYAI_PORT: String(PORT),
      COSTMYAI_FLUSH_INTERVAL_MS: "600000",
    }),
  );
  await new Promise<void>((resolve) => gateway.server.listen(PORT, resolve));
  // The container's own poll, against the real endpoint — not a seeded map.
  for (let i = 0; i < 60 && !gateway.switches.status().active; i++) {
    await new Promise((r) => setTimeout(r, 250));
  }
}, 120_000);

afterAll(async () => {
  if (!PROVIDER_KEY) return;
  await gateway.shutdown("SIGTERM");
  await admin.from("usage_events").delete().eq("org_id", orgId);
  await admin.from("usage_rollups").delete().eq("org_id", orgId);
  await admin.from("switches").delete().eq("org_id", orgId);
  await admin.from("api_keys").delete().eq("org_id", orgId);
  await admin.from("organizations").delete().eq("id", orgId);
  await admin.auth.admin.deleteUser(ownerId);
}, 120_000);

live("Stage 6 against a live provider", () => {
  it("the server itself marks the switch executable and ships it to the container", async () => {
    const plan = await buildSwitchPlan(orgId);
    const entry = plan.switches.find((s) => s.id === switchId)!;
    expect(entry.phase).toBe(1);
    expect(entry.gate).toBe("connected");
    expect(entry.executable).toBe(true);
    expect(entry.target.model_key).toBe(TO_MODEL);

    // And the container is serving that plan, fetched over real HTTP.
    const status = gateway.switches.status();
    expect(status.active).toBe(true);
    expect(status.executable).toBeGreaterThan(0);
  }, 60_000);

  it("really serves the cheaper model, and says so on the caller's own response", async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Lovable-API-Key": PROVIDER_KEY!,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: FROM_MODEL,
        messages: [{ role: "user", content: "Reply with the single word: pong" }],
        max_tokens: 16,
      }),
    });
    const text = await res.text();
    expect(res.status).toBe(200);

    // Disclosure, on the customer's real response.
    expect(res.headers.get("x-costmyai-reroute")).toBe("applied");
    expect(res.headers.get("x-costmyai-switch")).toBe(switchId);
    expect(res.headers.get("x-costmyai-original-model")).toBe(FROM_MODEL);
    expect(res.headers.get("x-costmyai-model")).toBe(TO_MODEL);

    // The provider's own answer says which model actually ran.
    const payload = JSON.parse(text) as {
      model: string;
      choices: { message: { content: string } }[];
      usage: { prompt_tokens: number; completion_tokens: number };
    };
    expect(payload.model).toContain("flash-lite");
    expect(payload.choices[0]!.message.content.toLowerCase()).toContain("pong");

    // The event, in the real database, carries the provenance the money needs.
    await flushMetered(1);
    const { data: rows } = await admin
      .from("usage_events")
      .select(
        "model_key, host, rerouted, original_model_key, original_host, route_reason, fallback_reason, input_tokens, output_tokens, status",
      )
      .eq("org_id", orgId);
    expect(rows).toHaveLength(1);
    const event = rows![0]!;
    expect(event.rerouted).toBe(true);
    expect(event.model_key).toBe(TO_MODEL);
    expect(event.original_model_key).toBe(FROM_MODEL);
    expect(event.original_host).toBe(WIRE_HOST);
    expect(event.route_reason).toBe(switchId);
    expect(event.fallback_reason).toBeNull();
    expect(event.status).toBe("ok");
    // Real counters, from the real provider's envelope.
    expect(event.input_tokens).toBe(payload.usage.prompt_tokens);
    expect(event.output_tokens).toBe(payload.usage.completion_tokens);
    expect(event.input_tokens).toBeGreaterThan(0);

    // Nothing of the credential or the conversation travelled with it.
    expect(JSON.stringify(event)).not.toContain(PROVIDER_KEY);
    expect(JSON.stringify(event)).not.toContain("pong");
  }, 120_000);

  it("refuses to value the saving on a host we hold no price for", async () => {
    const [savings] = await computeSwitchSavings(admin as never, orgId);
    expect(savings?.switchId).toBe(switchId);
    // The honest outcome: provenance recorded, money withheld. This aggregator
    // is not in `host_prices`, so the event is counted as unpriced and the
    // stored `saved_usd` stays at zero rather than being guessed from the
    // model's price on some other host.
    expect(savings!.unpricedEvents).toBe(1);
    expect(savings!.events).toBe(0);
    expect(savings!.savedUsd).toBe(0);

    const { data: row } = await admin.from("switches").select("saved_usd").eq("id", switchId).single();
    expect(Number(row!.saved_usd)).toBe(0);
  }, 60_000);
});
