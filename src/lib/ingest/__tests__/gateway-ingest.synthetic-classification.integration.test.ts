/**
 * Regression test — gateway-ingest synthetic/real classification boundary.
 *
 * Bug class covered (fixed commit 80bf5665, src/routes/api/public/gateway/ingest.ts):
 * the synthetic_tenant_registry upsert on LEDGER ran unconditionally on every
 * event instead of being gated on organizations.is_synthetic (MAIN). Net effect:
 * real orgs got silently written into the synthetic registry and disappeared
 * from real_gateway_ledger_reconciliation. Inverse of the earlier Chain Drill
 * Co bug (a synthetic fixture marked real) — same failure class (a
 * classification flag not surviving a system boundary), opposite direction.
 *
 * Confirmed this session: LEDGER `gateway_events.customer_id` carries the MAIN
 * organization id (verified against a live row), so scoping every LEDGER query
 * and the teardown by customer_id = <org id> is correct.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { ledgerDb } from "@/lib/ledger/ledger-client.server";
import { mintApiKey } from "@/lib/ingest/keys.server";
import { guardIntegrationDatabase } from "../../__tests__/support/isolation";

const URL = process.env["SUPABASE_URL"]!;
const SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
const PUBLISHABLE = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
// Repo convention for route-level integration tests: hit the local dev server,
// overridable via CONNECTOR_TEST_APP_URL. Never production.
const APP = process.env["CONNECTOR_TEST_APP_URL"] ?? "http://localhost:8080";

/** Repo convention: sb_* keys are opaque, so send them as `apikey`, not Bearer. */
function keyFetch(key: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined
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

const stamp = `qa-regression-ingest-synth-gate-${Date.now()}`;

type Actor = { id: string; client: SupabaseClient; email: string };

/** drizzle neon-http returns a FullQueryResults object, not a bare array. */
function resultRows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  const rows = (result as { rows?: unknown[] } | null)?.rows;
  return Array.isArray(rows) ? rows : [];
}

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
  const signedIn = await client.auth.signInWithPassword({ email, password: "REGRESSION_TEST_PW!23" });
  if (signedIn.error) throw signedIn.error;
  return { id: user.user.id, client, email };
}


let realActor: Actor;
let syntheticActor: Actor;
let realOrgId: string;
let syntheticOrgId: string;
let realToken: string;
let syntheticToken: string;

beforeAll(async () => {
  realActor = await makeActor("real");
  syntheticActor = await makeActor("synthetic");

  // public.create_organization(_name text) RETURNS uuid — the org id directly,
  // not a wrapper object (verified in migration 20260731135105).
  const { data: realOrg, error: realOrgErr } = await realActor.client.rpc("create_organization", {
    _name: `qa-real-org-${stamp}`,
  });
  if (realOrgErr) throw realOrgErr;
  realOrgId = realOrg as unknown as string;

  const { data: synthOrg, error: synthOrgErr } = await syntheticActor.client.rpc("create_organization", {
    _name: `qa-synthetic-org-${stamp}`,
  });
  if (synthOrgErr) throw synthOrgErr;
  syntheticOrgId = synthOrg as unknown as string;

  const { error: markErr } = await admin
    .from("organizations")
    .update({ is_synthetic: true })
    .eq("id", syntheticOrgId);
  if (markErr) throw markErr;

  const { data: realOrgRow, error: realOrgRowErr } = await admin
    .from("organizations")
    .select("is_synthetic")
    .eq("id", realOrgId)
    .single();
  if (realOrgRowErr) throw realOrgRowErr;
  if (realOrgRow?.is_synthetic !== false) {
    throw new Error(
      "Fixture assumption broken: create_organization's default is_synthetic is not `false` — " +
        "this test's real-org branch would be meaningless until this is investigated."
    );
  }

  const realMinted = await mintApiKey(realOrgId, `qa-regression-${stamp}-real`, realActor.id, "cgw_");
  realToken = realMinted.token;
  const syntheticMinted = await mintApiKey(
    syntheticOrgId,
    `qa-regression-${stamp}-synthetic`,
    syntheticActor.id,
    "cgw_"
  );
  syntheticToken = syntheticMinted.token;
});

afterAll(async () => {
  const scopedIds = [realOrgId, syntheticOrgId].filter(Boolean);
  if (scopedIds.length) {
    const db = ledgerDb();
    // LEDGER stores customer_id as text on some tables and uuid on others —
    // compare as text so one teardown works against both.
    await db.execute(
      sql`DELETE FROM gateway_events WHERE customer_id::text = ANY(${sql.raw(pgTextArray(scopedIds))})`
    );
    await db.execute(
      sql`DELETE FROM synthetic_tenant_registry WHERE customer_id::text = ANY(${sql.raw(pgTextArray(scopedIds))})`
    );

  }
  await admin.from("api_keys").delete().in("org_id", scopedIds);
  await admin.from("organizations").delete().in("id", scopedIds);
  if (realActor?.id) await admin.auth.admin.deleteUser(realActor.id);
  if (syntheticActor?.id) await admin.auth.admin.deleteUser(syntheticActor.id);
});

/** Test-only literal builder; ids come from Supabase and are validated uuids. */
function pgTextArray(ids: string[]): string {
  const safe = ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id)).map((id) => `'${id}'::text`);
  return `ARRAY[${safe.join(",")}]`;
}


async function sendIngestEvent(token: string) {
  return fetch(`${APP}/api/public/gateway/ingest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-opus-4.5",
      host: "api.anthropic.com",
      endpointType: "chat",
      inputTokens: null,
      inputBytes: null,
      outputTokens: null,
      outputBytes: null,
      latencyMs: 1,
      httpStatus: 200,
      ts: Math.floor(Date.now() / 1000),
      taskShape: { hasTools: false, streaming: false, maxTokens: null, temperature: null },
    }),
  });
}

describe("gateway-ingest: synthetic/real classification boundary (regression, commit 80bf5665)", () => {
  it("a real org's event does NOT create a synthetic_tenant_registry row", async () => {
    const response = await sendIngestEvent(realToken);
    expect(response.status).toBe(200);

    const db = ledgerDb();
    const rows = resultRows(
      await db.execute(sql`SELECT * FROM synthetic_tenant_registry WHERE customer_id = ${realOrgId}`)
    );
    expect(rows).toHaveLength(0);
  });

  it("a synthetic org's event DOES create a synthetic_tenant_registry row", async () => {
    const response = await sendIngestEvent(syntheticToken);
    expect(response.status).toBe(200);

    const db = ledgerDb();
    const rows = resultRows(
      await db.execute(sql`SELECT * FROM synthetic_tenant_registry WHERE customer_id = ${syntheticOrgId}`)
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("downstream: real org's event IS queryable via real_gateway_ledger_reconciliation", async () => {
    const db = ledgerDb();
    const rows = resultRows(
      await db.execute(sql`SELECT * FROM real_gateway_ledger_reconciliation WHERE customer_id = ${realOrgId}`)
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("downstream: synthetic org's event is NOT queryable via real_gateway_ledger_reconciliation", async () => {
    const db = ledgerDb();
    const rows = resultRows(
      await db.execute(sql`SELECT * FROM real_gateway_ledger_reconciliation WHERE customer_id = ${syntheticOrgId}`)
    );
    expect(rows).toHaveLength(0);
  });

  it("upsert is idempotent: sending the same synthetic org's event twice does not duplicate the registry row", async () => {
    await sendIngestEvent(syntheticToken);
    const db = ledgerDb();
    const rows = resultRows(
      await db.execute(sql`SELECT * FROM synthetic_tenant_registry WHERE customer_id = ${syntheticOrgId}`)
    );
    expect(rows).toHaveLength(1);
  });
});
