/**
 * Regression test — usage writes must carry the workspace's synthetic flag.
 *
 * `ingestEvents` used to write `usage_events` and `usage_rollups` with no
 * `is_synthetic` value at all, leaving the column to a database default. That
 * is the same failure class as the gateway registry bug: a classification flag
 * that does not survive a boundary. Both tables are read by revenue-facing
 * aggregates, so a synthetic workspace whose rows look real inflates them.
 *
 * This drives the real `ingestEvents` for a real org and for a synthetic org
 * and reads both tables back.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ingestEvents } from "@/lib/ingest/ingest.server";
import { ingestEventSchema } from "@/lib/ingest/schema";
import { guardIntegrationDatabase } from "../../__tests__/support/isolation";

const URL = process.env["SUPABASE_URL"]!;
const SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
const PUBLISHABLE = process.env["SUPABASE_PUBLISHABLE_KEY"]!;

/** Repo convention: sb_* keys are opaque, so send them as `apikey`, not Bearer. */
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

const stamp = `qa-ingest-is-synthetic-${Date.now()}`;

type Actor = { id: string; client: SupabaseClient; email: string };

async function makeActor(who: string): Promise<Actor> {
  const email = `${who}-${stamp}@costmyai-test.dev`;
  const { data: user, error } = await admin.auth.admin.createUser({
    email,
    password: "REGRESSION_TEST_PW!23",
    email_confirm: true,
  });
  if (error || !user?.user) throw error ?? new Error("makeActor: no user returned");
  const client = createClient(URL, PUBLISHABLE, {
    global: { fetch: keyFetch(PUBLISHABLE) },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signedIn = await client.auth.signInWithPassword({
    email,
    password: "REGRESSION_TEST_PW!23",
  });
  if (signedIn.error) throw signedIn.error;
  return { id: user.user.id, client, email };
}

let realActor: Actor;
let syntheticActor: Actor;
let realOrgId: string;
let syntheticOrgId: string;

const occurredAt = new Date().toISOString();

function eventFor(idempotencyKey: string) {
  // Parsed through the real schema so every defaulted field (cache tokens,
  // parse_status, classifier_revision) matches what the endpoint would hand
  // ingestEvents in production.
  return ingestEventSchema.parse({
    occurred_at: occurredAt,
    model_key: "gpt-5.5",
    host: "api.openai.com",
    task_hint: "chat",
    input_tokens: 1_000,
    output_tokens: 200,
    latency_ms: 120,
    status: "ok",
    idempotency_key: idempotencyKey,
  });
}

beforeAll(async () => {
  realActor = await makeActor("real");
  syntheticActor = await makeActor("synthetic");

  const { data: realOrg, error: realErr } = await realActor.client.rpc("create_organization", {
    _name: `qa-real-org-${stamp}`,
  });
  if (realErr) throw realErr;
  realOrgId = realOrg as unknown as string;

  const { data: synthOrg, error: synthErr } = await syntheticActor.client.rpc(
    "create_organization",
    { _name: `qa-synthetic-org-${stamp}` },
  );
  if (synthErr) throw synthErr;
  syntheticOrgId = synthOrg as unknown as string;

  const { error: markErr } = await admin
    .from("organizations")
    .update({ is_synthetic: true })
    .eq("id", syntheticOrgId);
  if (markErr) throw markErr;
}, 60_000);

afterAll(async () => {
  const ids = [realOrgId, syntheticOrgId].filter(Boolean);
  if (ids.length) {
    await admin.from("usage_rollups").delete().in("org_id", ids);
    await admin.from("usage_events").delete().in("org_id", ids);
    await admin.from("organizations").delete().in("id", ids);
  }
  if (realActor?.id) await admin.auth.admin.deleteUser(realActor.id);
  if (syntheticActor?.id) await admin.auth.admin.deleteUser(syntheticActor.id);
}, 60_000);

describe("ingestEvents: is_synthetic follows the workspace, not the default", () => {
  it("writes real events and rollups with is_synthetic = false", async () => {
    const result = await ingestEvents(realOrgId, [eventFor(`${stamp}-real`)]);
    expect(result.accepted).toBeGreaterThan(0);

    const { data: events } = await admin
      .from("usage_events")
      .select("is_synthetic")
      .eq("org_id", realOrgId);
    expect(events?.length).toBeGreaterThan(0);
    expect(events?.every((r) => r.is_synthetic === false)).toBe(true);

    const { data: rollups } = await admin
      .from("usage_rollups")
      .select("is_synthetic")
      .eq("org_id", realOrgId);
    expect(rollups?.length).toBeGreaterThan(0);
    expect(rollups?.every((r) => r.is_synthetic === false)).toBe(true);
  }, 60_000);

  it("writes synthetic events and rollups with is_synthetic = true", async () => {
    const result = await ingestEvents(syntheticOrgId, [eventFor(`${stamp}-synthetic`)]);
    expect(result.accepted).toBeGreaterThan(0);

    const { data: events } = await admin
      .from("usage_events")
      .select("is_synthetic")
      .eq("org_id", syntheticOrgId);
    expect(events?.length).toBeGreaterThan(0);
    expect(events?.every((r) => r.is_synthetic === true)).toBe(true);

    const { data: rollups } = await admin
      .from("usage_rollups")
      .select("is_synthetic")
      .eq("org_id", syntheticOrgId);
    expect(rollups?.length).toBeGreaterThan(0);
    expect(rollups?.every((r) => r.is_synthetic === true)).toBe(true);
  }, 60_000);
});
