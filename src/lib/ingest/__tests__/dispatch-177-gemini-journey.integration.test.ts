/**
 * Dispatch 177 item 1 — the Journey-1 bar, for Google's NATIVE envelope.
 *
 * Dispatch 102 proved a real hosted call all the way into a workspace, but
 * over an OpenAI-compatible endpoint. Dispatch 103/176 proved the native
 * Google envelope was really parsed, but stopped at the parsed event. This
 * test joins the two halves for Gemini specifically:
 *
 *   real generativelanguage.googleapis.com call
 *     → real container (pass-through, credential never read)
 *     → real /api/public/v1/events ingest
 *     → real row in usage_events
 *     → real rollup in usage_rollups
 *     → real dashboard snapshot for that workspace
 *
 * Nothing is mocked, and it SKIPS LOUDLY without GEMINI_API_KEY rather than
 * degrading into the fixture it exists to replace.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildDashboardSnapshot } from "@/lib/dashboard.server";
import { mintApiKey } from "@/lib/ingest/keys.server";

import { loadConfig } from "../../../../packages/gateway-container/src/config";
import { createGateway } from "../../../../packages/gateway-container/src/index";
import { guardIntegrationDatabase } from "../../__tests__/support/isolation";

const URL_ = process.env["SUPABASE_URL"]!;
const SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
const PUBLISHABLE = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
const APP = process.env["CONNECTOR_TEST_APP_URL"] ?? "http://localhost:8080";

const PROVIDER_URL = "https://generativelanguage.googleapis.com";
const GEMINI_KEY = process.env["GEMINI_API_KEY"];
const MODEL = "gemini-3.6-flash";
const PORT = 8794;

if (!GEMINI_KEY) {
  console.warn("[dispatch-177] SKIPPING the Gemini journey proof: GEMINI_API_KEY is not set.");
}

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

const stamp = Date.now();
const PASSWORD = "Test-Gemini-Journey-2026!";

let ownerId: string;
let orgId: string;
let ownerClient: SupabaseClient;
let gateway: ReturnType<typeof createGateway>;

const live = GEMINI_KEY ? describe : describe.skip;

async function flushMetered(expected: number): Promise<void> {
  for (let i = 0; i < 100 && gateway.queue.size < expected; i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  await gateway.flush();
}

beforeAll(async () => {
  if (!GEMINI_KEY) return;
  const email = `gemini-journey-${stamp}@costmyai-test.dev`;
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (created.error) throw created.error;
  ownerId = created.data.user!.id;
  ownerClient = createClient(URL_, PUBLISHABLE, {
    global: { fetch: keyFetch(PUBLISHABLE) },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signedIn = await ownerClient.auth.signInWithPassword({ email, password: PASSWORD });
  if (signedIn.error) throw signedIn.error;
  const { data, error } = await ownerClient.rpc("create_organization", { _name: `Gemini Journey ${stamp}` });
  if (error) throw error;
  orgId = data as string;
  const token = (await mintApiKey(orgId, "Gemini journey test", ownerId)).token;

  gateway = createGateway(
    loadConfig({
      COSTMYAI_INGEST_TOKEN: token,
      COSTMYAI_UPSTREAM_URL: PROVIDER_URL,
      COSTMYAI_BASE_URL: APP,
      COSTMYAI_SPOOL_DIR: mkdtempSync(join(tmpdir(), "costmyai-d177-")),
      COSTMYAI_PORT: String(PORT),
      COSTMYAI_FLUSH_INTERVAL_MS: "600000",
    }),
  );
  await new Promise<void>((resolve) => gateway.server.listen(PORT, resolve));
}, 90_000);

afterAll(async () => {
  if (!GEMINI_KEY) return;
  await gateway.shutdown("SIGTERM");
  await admin.from("usage_events").delete().eq("org_id", orgId);
  await admin.from("usage_rollups").delete().eq("org_id", orgId);
  await admin.from("organizations").delete().eq("id", orgId);
  await admin.auth.admin.deleteUser(ownerId);
}, 90_000);

live("a real native Gemini call, all the way to a dashboard", () => {
  it("lands in usage_events, rolls up, and is visible in the snapshot", async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": GEMINI_KEY! },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "Reply with the single word: pong" }] }],
        generationConfig: { maxOutputTokens: 64 },
      }),
    });
    const text = await res.text();
    console.log("GEMINI RAW RESPONSE", text);
    expect(res.status).toBe(200);
    const payload = JSON.parse(text) as {
      modelVersion: string;
      usageMetadata: {
        promptTokenCount: number;
        candidatesTokenCount?: number;
        thoughtsTokenCount?: number;
        totalTokenCount: number;
      };
    };
    const usage = payload.usageMetadata;
    const billedOutput = (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0);

    await flushMetered(1);

    const { data: rows } = await admin
      .from("usage_events")
      .select("model_key, host, input_tokens, output_tokens, status, parse_status, latency_ms")
      .eq("org_id", orgId);
    console.log("USAGE_EVENTS", JSON.stringify(rows, null, 1));
    expect(rows).toHaveLength(1);
    const event = rows![0]!;
    expect(event.parse_status).toBe("parsed");
    expect(event.input_tokens).toBe(usage.promptTokenCount);
    expect(event.output_tokens).toBe(billedOutput);
    expect(event.status).toBe("ok");
    expect(JSON.stringify(event)).not.toContain(GEMINI_KEY!);
    expect(JSON.stringify(event)).not.toContain("pong");

    const { data: rollups } = await admin
      .from("usage_rollups")
      .select("granularity, model_key, host, requests, input_tokens, output_tokens, cost_usd")
      .eq("org_id", orgId)
      .order("granularity", { ascending: true });
    console.log("USAGE_ROLLUPS", JSON.stringify(rollups, null, 1));
    expect(rollups!.length).toBeGreaterThan(0);
    const day = rollups!.find((r) => r.granularity === "day")!;
    expect(day.requests).toBe(1);
    expect(day.input_tokens).toBe(usage.promptTokenCount);
    expect(day.output_tokens).toBe(billedOutput);

    const snapshot = await buildDashboardSnapshot({ days: 30, orgId, client: admin as never });
    console.log("DASHBOARD", JSON.stringify({
      spend: snapshot.totals.spend,
      requests: snapshot.totals.requests,
    }, null, 1));
    expect(snapshot.totals.requests).toBe(1);
  }, 180_000);
});
