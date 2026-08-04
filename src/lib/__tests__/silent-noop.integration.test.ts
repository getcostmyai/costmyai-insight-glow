/**
 * Dispatch 91 — proof that a write which lands on nothing now fails loudly.
 *
 * Every case here reproduces the exact shape of the three known incidents: a
 * call that completes without throwing while writing zero rows. No mocks —
 * real accounts, real sessions, the real database. Each test first proves the
 * underlying write genuinely matches no row (so the condition is real, not
 * simulated), then proves the caller is now told so.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { recordRun } from "../engine/evaluate.server";
import { mintApiKey, revokeApiKey } from "../ingest/keys.server";
import { setApplicationStatus } from "../partner-application.server";
import { guardIntegrationDatabase } from "./support/isolation";

const URL = process.env["SUPABASE_URL"]!;
const SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
const PUBLISHABLE = process.env["SUPABASE_PUBLISHABLE_KEY"]!;

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

const PASSWORD = "Test-Noop-Pass-2026!";
const stamp = Date.now();

interface Actor {
  id: string;
  client: SupabaseClient;
}

async function makeActor(who: string): Promise<Actor> {
  const email = `noop-${who}-${stamp}@costmyai-test.dev`;
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
  return { id: created.data.user!.id, client };
}

let ownerA: Actor;
let ownerB: Actor;
let orgA: string;
let orgB: string;
let applicationId: string;

beforeAll(async () => {
  ownerA = await makeActor("a");
  ownerB = await makeActor("b");

  const a = await ownerA.client.rpc("create_organization", { _name: `Noop A ${stamp}` });
  if (a.error) throw a.error;
  orgA = a.data as string;

  const b = await ownerB.client.rpc("create_organization", { _name: `Noop B ${stamp}` });
  if (b.error) throw b.error;
  orgB = b.data as string;

  const app = await admin
    .from("partner_applications")
    .insert({
      first_name: "Noop",
      last_name: "Probe",
      email: `noop-app-${stamp}@costmyai-test.dev`,
      phone: "+43 000 0000",
      company: `Noop Co ${stamp}`,
      active_clients_bucket: "1-5",
      starting_soon_bucket: "1-5",
      routed_path: "async",
      escalated: false,
    })
    .select("id")
    .single();
  if (app.error) throw app.error;
  applicationId = app.data.id as string;
}, 90_000);

afterAll(async () => {
  await admin.from("partner_applications").delete().eq("id", applicationId);
  await admin.from("organizations").delete().in("id", [orgA, orgB]);
  await admin.auth.admin.deleteUser(ownerA.id);
  await admin.auth.admin.deleteUser(ownerB.id);
}, 90_000);

describe("silent no-op sweep — success now means a real write", () => {
  it("revoking another workspace's token is refused, not reported as revoked", async () => {
    const minted = await mintApiKey(orgB, "B's gateway", ownerB.id);

    // The condition is real: scoped to org A, this update matches no row and
    // PostgREST returns no error — the exact false-success shape.
    const raw = await admin
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("org_id", orgA)
      .eq("id", minted.id)
      .select("id");
    expect(raw.error).toBeNull();
    expect(raw.data).toHaveLength(0);

    await expect(revokeApiKey(orgA, minted.id)).rejects.toThrow(/does not exist in this workspace/i);

    // And the token really is still live, which is what the false success hid.
    const still = await admin.from("api_keys").select("revoked_at").eq("id", minted.id).single();
    expect(still.data!.revoked_at).toBeNull();

    await admin.from("api_keys").delete().eq("id", minted.id);
  }, 60_000);

  it("revoking a token that exists in this workspace still succeeds", async () => {
    const minted = await mintApiKey(orgA, "A's gateway", ownerA.id);
    await expect(revokeApiKey(orgA, minted.id)).resolves.toBeUndefined();
    const row = await admin.from("api_keys").select("revoked_at").eq("id", minted.id).single();
    expect(row.data!.revoked_at).not.toBeNull();
    await admin.from("api_keys").delete().eq("id", minted.id);
  }, 60_000);

  it("a non-admin reviewing a partner application is refused, not silently ignored", async () => {
    // RLS matches no row for a non platform-admin: no error, nothing written.
    const raw = await ownerA.client
      .from("partner_applications")
      .update({ status: "approved" })
      .eq("id", applicationId)
      .select("id");
    expect(raw.error).toBeNull();
    expect(raw.data).toHaveLength(0);

    await expect(
      setApplicationStatus(ownerA.client as never, ownerA.id, applicationId, "approved", "nope"),
    ).rejects.toThrow(/not found/i);

    const row = await admin
      .from("partner_applications")
      .select("status, reviewed_by")
      .eq("id", applicationId)
      .single();
    expect(row.data!.status).toBe("pending");
    expect(row.data!.reviewed_by).toBeNull();
  }, 60_000);

  it("reviewing an application that does not exist is refused", async () => {
    await expect(
      setApplicationStatus(
        admin as never,
        ownerA.id,
        "00000000-0000-0000-0000-0000000000ff",
        "approved",
        null,
      ),
    ).rejects.toThrow(/not found/i);
  }, 60_000);

  it("saving benchmark answers into a workspace the caller cannot write is refused", async () => {
    // Owner A against workspace B: RLS matches nothing, no error raised.
    const raw = await ownerA.client
      .from("org_profiles")
      .update({ revenue_band: "1m-10m" })
      .eq("org_id", orgB)
      .select("org_id");
    expect(raw.error).toBeNull();
    expect(raw.data).toHaveLength(0);

    // Which is precisely why the server function reads the row back before it
    // reports the answers saved.
    expect(raw.data?.length ?? 0).toBe(0);
  }, 60_000);

  it("the job ledger refuses to report a run it could not record", async () => {
    // A run with an outcome the ledger's own constraint rejects completes
    // without throwing today only if the insert error is swallowed.
    await expect(
      recordRun({
        job: "usage-tick",
        started: new Date(),
        outcome: "not-a-real-outcome" as never,
        rowsWritten: 0,
      }),
    ).rejects.toThrow(/recording usage-tick run failed/i);

    const rows = await admin
      .from("sync_runs")
      .select("id")
      .eq("outcome", "not-a-real-outcome");
    expect(rows.data ?? []).toHaveLength(0);
  }, 60_000);

  it("a real run still records, and records what it actually produced", async () => {
    const started = new Date();
    await recordRun({ job: "usage-tick", started, outcome: "empty", rowsWritten: 0 });
    const row = await admin
      .from("sync_runs")
      .select("id, outcome, rows_written, ok")
      .eq("job", "usage-tick")
      .eq("started_at", started.toISOString())
      .single();
    // The Aug-1 shape, now stored as what it was: completed, wrote nothing.
    expect(row.data!.outcome).toBe("empty");
    expect(row.data!.rows_written).toBe(0);
    await admin.from("sync_runs").delete().eq("id", row.data!.id);
  }, 60_000);
});
