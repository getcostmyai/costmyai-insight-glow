/**
 * Real end-to-end proof that a retried push from the connector's spool cannot
 * double-count (Dispatch 101, finding #8).
 *
 * Nothing here is mocked below the HTTP boundary: a real workspace, a real
 * ingest token, the real public route on the running server, and the real
 * database behind it. The connector's own retry behaviour is proven separately
 * in connector.test.ts — it resends a byte-identical body. This test proves the
 * other half: what the server does when it receives that identical body twice.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { INGEST_PATHS } from "@/lib/ingest/contract";
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

// Fixtures never persist in the customer database — see support/isolation.ts.
guardIntegrationDatabase(admin);

const stamp = Date.now();
const PASSWORD = "Test-Connector-Pass-2026!";

let ownerId: string;
let orgId: string;
let token: string;
let ownerClient: SupabaseClient;

beforeAll(async () => {
  const email = `connector-${stamp}@costmyai-test.dev`;
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
    _name: `Connector Test ${stamp}`,
  });
  if (error) throw error;
  orgId = data as string;
  token = (await mintApiKey(orgId, "Connector retry test", ownerId)).token;
}, 60_000);

afterAll(async () => {
  await admin.from("usage_events").delete().eq("org_id", orgId);
  await admin.from("usage_rollups").delete().eq("org_id", orgId);
  await admin.from("organizations").delete().eq("id", orgId);
  await admin.auth.admin.deleteUser(ownerId);
}, 60_000);

/** Exactly the body the container's queue holds and resends verbatim. */
const body = JSON.stringify({
  v: 1,
  events: [
    {
      occurred_at: new Date().toISOString(),
      model_key: "gpt-4o-mini",
      host: "api.openai.com",
      task_hint: "unknown",
      input_tokens: 1200,
      output_tokens: 300,
      latency_ms: 812,
      status: "ok",
      parse_status: "parsed",
      idempotency_key: `connector-retry-${stamp}`,
    },
  ],
});

function push() {
  return fetch(`${APP}${INGEST_PATHS.events}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body,
  });
}

describe("a spool retry against the real ingest route", () => {
  it("accepts once and dedupes every resend, leaving exactly one event", async () => {
    const first = await push();
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ accepted: 1, duplicates: 0 });

    // The container resends the same batch after a partition; twice, for good measure.
    const second = await push();
    const third = await push();
    expect(await second.json()).toMatchObject({ accepted: 0, duplicates: 1 });
    expect(await third.json()).toMatchObject({ accepted: 0, duplicates: 1 });

    const { data: rows } = await admin
      .from("usage_events")
      .select("id, input_tokens, task_hint, idempotency_key")
      .eq("org_id", orgId);
    expect(rows).toHaveLength(1);
    expect(rows![0]).toMatchObject({ input_tokens: 1200, task_hint: "unknown" });

    // And the derived rollup counts the request once, not three times.
    const { data: rollups } = await admin
      .from("usage_rollups")
      .select("granularity, requests, input_tokens")
      .eq("org_id", orgId)
      .eq("granularity", "day");
    expect(rollups).toHaveLength(1);
    expect(rollups![0]).toMatchObject({ requests: 1, input_tokens: 1200 });
  }, 90_000);
});
