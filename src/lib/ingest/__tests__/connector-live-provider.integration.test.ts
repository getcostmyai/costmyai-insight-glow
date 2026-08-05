/**
 * Dispatch 102 item 1 — the connector against a REAL external provider.
 *
 * Nothing in this file is mocked. A real container instance fronts a real
 * hosted inference API (the Lovable AI Gateway, an OpenAI-compatible endpoint
 * serving Google's Gemini models), a real completion is generated, its real
 * usage counters are parsed off the real response envelope, and the resulting
 * event lands in a real workspace in the real database and is rolled up there.
 *
 * The provider credential lives only in the caller's request headers, exactly
 * as a customer's would; the container copies it through and never reads it.
 *
 * Skips — loudly — when no provider credential is present, rather than
 * silently degrading into the mock this dispatch exists to replace.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { mintApiKey } from "@/lib/ingest/keys.server";

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
/** Priced in our own catalog, so the event can be checked all the way through. */
const MODEL = "google/gemini-2.5-flash";

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
const PASSWORD = "Test-Live-Provider-2026!";
const PORT = 8791;

let ownerId: string;
let orgId: string;
let ownerClient: SupabaseClient;
let gateway: ReturnType<typeof createGateway>;
/** Everything the container printed while these tests ran. */
const logLines: string[] = [];

async function completion(body: unknown, init: { model?: string } = {}) {
  void init;
  const startedAt = Date.now();
  const res = await fetch(`http://127.0.0.1:${PORT}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // The provider credential — through the container, never stored by it.
      "Lovable-API-Key": PROVIDER_KEY!,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, text, startedAt, endedAt: Date.now() };
}

const live = PROVIDER_KEY ? describe : describe.skip;

beforeAll(async () => {
  if (!PROVIDER_KEY) return;
  const email = `live-provider-${stamp}@costmyai-test.dev`;
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (created.error) throw created.error;
  ownerId = created.data.user!.id;
  ownerClient = createClient(URL_, PUBLISHABLE, {
    global: { fetch: keyFetch(PUBLISHABLE) },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signedIn = await ownerClient.auth.signInWithPassword({ email, password: PASSWORD });
  if (signedIn.error) throw signedIn.error;
  const { data, error } = await ownerClient.rpc("create_organization", { _name: `Live Provider ${stamp}` });
  if (error) throw error;
  orgId = data as string;
  const token = (await mintApiKey(orgId, "Live provider test", ownerId)).token;

  // Capture every line the container logs, for the credential-safety check.
  const realLog = console.log;
  console.log = (...args: unknown[]) => {
    logLines.push(args.map(String).join(" "));
    realLog(...args);
  };

  gateway = createGateway(
    loadConfig({
      COSTMYAI_INGEST_TOKEN: token,
      COSTMYAI_UPSTREAM_URL: PROVIDER_URL,
      COSTMYAI_BASE_URL: APP,
      COSTMYAI_SPOOL_DIR: mkdtempSync(join(tmpdir(), "costmyai-live-")),
      COSTMYAI_PORT: String(PORT),
      COSTMYAI_FLUSH_INTERVAL_MS: "600000", // flushed explicitly, so assertions are deterministic
    }),
  );
  await new Promise<void>((resolve) => gateway.server.listen(PORT, resolve));
}, 90_000);

afterAll(async () => {
  if (!PROVIDER_KEY) return;
  await gateway.shutdown("SIGTERM");
  await admin.from("usage_events").delete().eq("org_id", orgId);
  await admin.from("usage_rollups").delete().eq("org_id", orgId);
  await admin.from("organizations").delete().eq("id", orgId);
  await admin.auth.admin.deleteUser(ownerId);
}, 90_000);

live("a real completion through the container", () => {
  it("reaches the provider, returns its answer, and lands parsed in the workspace", async () => {
    const res = await completion({
      model: MODEL,
      messages: [{ role: "user", content: "Reply with the single word: pong" }],
      max_tokens: 16,
    });

    // 1. Real provider response, passed back to the caller.
    expect(res.status).toBe(200);
    const payload = JSON.parse(res.text) as {
      model: string;
      choices: { message: { content: string } }[];
      usage: { prompt_tokens: number; completion_tokens: number };
    };
    expect(payload.model).toContain("gemini");
    expect(payload.choices[0]!.message.content.toLowerCase()).toContain("pong");
    expect(payload.usage.prompt_tokens).toBeGreaterThan(0);

    // 2. Metadata pushed to the real app, into a real workspace.
    await gateway.flush();
    const { data: rows } = await admin
      .from("usage_events")
      .select("model_key, host, input_tokens, output_tokens, status, parse_status, task_hint, latency_ms")
      .eq("org_id", orgId);
    expect(rows).toHaveLength(1);
    const event = rows![0]!;

    // 3. The counters are the provider's own, read off the real envelope.
    expect(event.parse_status).toBe("parsed");
    expect(event.model_key).toBe(MODEL);
    expect(event.input_tokens).toBe(payload.usage.prompt_tokens);
    expect(event.output_tokens).toBe(payload.usage.completion_tokens);
    expect(event.status).toBe("ok");
    expect(event.latency_ms).toBeGreaterThan(0);

    // 4. Nothing of the request or the credential travelled with it.
    expect(JSON.stringify(event)).not.toContain(PROVIDER_KEY);
    expect(JSON.stringify(event)).not.toContain("pong");
  }, 120_000);
});

live("concurrency", () => {
  it("handles genuinely simultaneous calls, all in flight at once", async () => {
    const N = 6;
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        completion({
          model: MODEL,
          messages: [{ role: "user", content: `Reply with the single word: pong${i}` }],
          max_tokens: 16,
        }),
      ),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);

    // Overlap, measured: the largest number of requests whose [start, end]
    // intervals were open at the same instant. Sequential calls score 1.
    const points = results.flatMap((r) => [
      { t: r.startedAt, d: 1 },
      { t: r.endedAt, d: -1 },
    ]);
    points.sort((a, b) => a.t - b.t || a.d - b.d);
    let open = 0;
    let peak = 0;
    for (const p of points) {
      open += p.d;
      peak = Math.max(peak, open);
    }
    expect(peak).toBe(N);

    // And every one of them was metered exactly once, under its own key.
    await gateway.flush();
    const { data: rows } = await admin
      .from("usage_events")
      .select("idempotency_key")
      .eq("org_id", orgId);
    expect(rows).toHaveLength(N + 1); // the six here plus the one above
    expect(new Set(rows!.map((r) => r.idempotency_key)).size).toBe(N + 1);
  }, 180_000);
});

live("a provider error", () => {
  it("passes the provider's own status and body back byte-identically", async () => {
    const body = {
      model: "no-such-model-at-all",
      messages: [{ role: "user", content: "hi" }],
    };

    const throughContainer = await completion(body);
    const direct = await fetch(`${PROVIDER_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Lovable-API-Key": PROVIDER_KEY!,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify(body),
    });
    const directText = await direct.text();

    expect(throughContainer.status).toBe(direct.status);
    expect(direct.status).toBeGreaterThanOrEqual(400);
    expect(throughContainer.text).toBe(directText);

    // The failure is still metered, as an error, with no invented tokens.
    await gateway.flush();
    const { data: rows } = await admin
      .from("usage_events")
      .select("status, input_tokens, output_tokens, parse_status")
      .eq("org_id", orgId)
      .eq("status", "error");
    expect(rows!.length).toBeGreaterThanOrEqual(1);
    expect(rows![0]!.input_tokens).toBe(0);
  }, 120_000);

  it("logs a deliberately broken push without a credential anywhere in the output", async () => {
    // A second container, pointed at a CostMyAI that is not there. A real
    // completion goes through it (real provider, real credential header), and
    // the metadata push then fails for real and is logged for real.
    const port = PORT + 1;
    const broken = createGateway(
      loadConfig({
        COSTMYAI_INGEST_TOKEN: "cma_live_broken_token_value",
        COSTMYAI_UPSTREAM_URL: PROVIDER_URL,
        COSTMYAI_BASE_URL: "http://127.0.0.1:9",
        COSTMYAI_SPOOL_DIR: mkdtempSync(join(tmpdir(), "costmyai-broken-")),
        COSTMYAI_PORT: String(port),
        COSTMYAI_FLUSH_INTERVAL_MS: "600000",
      }),
    );
    await new Promise<void>((resolve) => broken.server.listen(port, resolve));
    const before = logLines.length;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", "Lovable-API-Key": PROVIDER_KEY! },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: "user", content: "Reply with the single word: pong" }],
          max_tokens: 16,
        }),
      });
      expect(res.status).toBe(200);
      await broken.flush();
    } finally {
      await broken.shutdown("SIGTERM");
    }

    const emitted = logLines.slice(before);
    // A real failure was really logged.
    expect(emitted.join("\n")).toContain("upstream flush incomplete");
    const all = emitted.join("\n");
    expect(all).not.toContain(PROVIDER_KEY);
    expect(all).not.toContain("cma_live_broken_token_value");
    expect(all.toLowerCase()).not.toContain("lovable-api-key");
    expect(all.toLowerCase()).not.toContain("authorization");
    console.info("--- container log under deliberate failure ---\n" + all);
  }, 120_000);
});
