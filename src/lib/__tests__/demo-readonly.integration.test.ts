/**
 * The demo workspace is now shared: the founder and every active partner read
 * the same org. That is only safe while the workspace refuses writes at the
 * data boundary, so the guarantee is guarded here rather than assumed.
 *
 * Form used, stated plainly: this harness cannot mint a partner-session token
 * through the real sign-in flow and also leave no partner residue behind, so
 * the caller here is a real, signed-in, non-member user. That is the closest
 * real thing, and it is the exact shape of the refusal that protects a partner
 * too: a partner has no membership row in the demo workspace either, and the
 * SECURITY DEFINER functions re-derive the actor from auth.uid() the same way
 * for both. No mocks, real database.
 *
 * Which SQLSTATE each probe expects, and why it matters:
 *
 *   objectives insert  -> 42501, insufficient_privilege. That is the row-level
 *     security refusal and nothing else. The row offered is otherwise valid, so
 *     the policy is the only possible reason to fail. The test asserts the code
 *     is 42501 and explicitly asserts it is NOT 22P02 (invalid enum input) or
 *     23502 (not-null violation), because a malformed row is rejected before any
 *     policy is consulted and would make this file pass with RLS switched off.
 *     A previous version of this probe sent objective: "cheapest", which is not
 *     a label of objective_kind (cost, latency, quality_floor), and passed for
 *     exactly that wrong reason.
 *
 *   organizations update -> no error is required. An UPDATE filtered out by a
 *     USING clause matches zero rows and reports success, so the assertion is
 *     the stored name, read back with the service role, not the error.
 *
 *   apply_switch rpc -> P0001, raise_exception, from the SECURITY DEFINER body
 *     refusing a non-manager and refusing a synthetic org. The probe asserts an
 *     error and asserts the recommendation's status is unchanged. Its
 *     precondition, an open recommendation in the demo workspace, is asserted
 *     rather than skipped: no open row means the probe tested nothing, and that
 *     must fail loudly instead of reading green. Nothing is ever seeded into the
 *     demo workspace to create that precondition.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEMO_ORG_ID } from "../access";
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

guardIntegrationDatabase(admin);

const PASSWORD = "Test-Demo-Readonly-2026!";
const email = `demo-reader-${Date.now()}@costmyai-test.dev`;

let userId: string;
let caller: SupabaseClient;

beforeAll(async () => {
  const created = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  userId = created.data.user!.id;
  caller = createClient(URL, PUBLISHABLE, {
    global: { fetch: keyFetch(PUBLISHABLE) },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signedIn = await caller.auth.signInWithPassword({ email, password: PASSWORD });
  if (signedIn.error) throw signedIn.error;
}, 60_000);

afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
}, 60_000);

describe("the shared demo workspace refuses writes", () => {
  it("refuses an objective write against the demo workspace", async () => {
    // A row with nothing wrong with it: valid enum label, every other column
    // nullable and left null. The policy is the only reason it can fail.
    const { error } = await caller
      .from("objectives")
      .insert({
        org_id: DEMO_ORG_ID,
        objective: "cost",
        created_by: userId,
        is_synthetic: true,
      });
    expect(error).not.toBeNull();
    expect(error?.code).not.toBe("22P02"); // invalid enum input, would prove nothing
    expect(error?.code).not.toBe("23502"); // not-null violation, would prove nothing
    expect(error?.code).toBe("42501"); // insufficient_privilege: the RLS refusal
    // Count what this caller could have written, not a string that was never valid.
    const { count } = await admin
      .from("objectives")
      .select("id", { count: "exact", head: true })
      .eq("org_id", DEMO_ORG_ID)
      .eq("created_by", userId);
    expect(count ?? 0).toBe(0);
  }, 30_000);

  it("refuses renaming the demo workspace", async () => {
    const before = await admin
      .from("organizations")
      .select("name")
      .eq("id", DEMO_ORG_ID)
      .maybeSingle();
    await caller.from("organizations").update({ name: "Hijacked" }).eq("id", DEMO_ORG_ID);
    const after = await admin
      .from("organizations")
      .select("name")
      .eq("id", DEMO_ORG_ID)
      .maybeSingle();
    expect(after.data?.name).toBe(before.data?.name);
    expect(after.data?.name).not.toBe("Hijacked");
  }, 30_000);

  it("refuses apply_switch on an open demo recommendation", async () => {
    const { data: rec } = await admin
      .from("recommendations")
      .select("id")
      .eq("org_id", DEMO_ORG_ID)
      .eq("status", "open")
      .limit(1)
      .maybeSingle();
    // The precondition is an assertion, not a skip: with no open row this probe
    // would test nothing, and that has to fail loudly.
    expect(rec?.id, "no open recommendation in the demo workspace to attempt").toBeTruthy();
    const { error } = await caller.rpc("apply_switch", { _rec_id: rec!.id });
    expect(error).not.toBeNull();
    const after = await admin
      .from("recommendations")
      .select("status")
      .eq("id", rec.id)
      .single();
    expect(after.data?.status).toBe("open");
  }, 30_000);
});
