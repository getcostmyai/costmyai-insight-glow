/**
 * Real end-to-end tests for workspace invitations.
 *
 * These run against the actual database with actual auth sessions — no mocks,
 * no fakes. Every acceptance below goes through `public.accept_invite` with a
 * genuine bearer token, which is the only way to prove the claim that matters:
 * the invitation is matched against the session's own verified email, not
 * against anything the caller supplies.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { guardIntegrationDatabase } from "./support/isolation";

const URL = process.env["SUPABASE_URL"]!;
const SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
const PUBLISHABLE = process.env["SUPABASE_PUBLISHABLE_KEY"]!;

/** New-format sb_ keys are opaque, not JWTs: send them as apikey only. */
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

const PASSWORD = "Test-Invite-Pass-2026!";
const stamp = Date.now();
const addr = (who: string) => `invite-${who}-${stamp}@costmyai-test.dev`;

interface Actor {
  id: string;
  email: string;
  client: SupabaseClient;
}

/** A real account with a real signed-in session. */
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
  expect(signedIn.data.session?.access_token).toBeTruthy();

  return { id: created.data.user!.id, email, client };
}

async function createOrg(actor: Actor, name: string): Promise<string> {
  const { data, error } = await actor.client.rpc("create_organization", { _name: name });
  if (error) throw error;
  return data as string;
}

async function invite(owner: Actor, orgId: string, email: string, role: "admin" | "member") {
  const { data, error } = await owner.client
    .from("org_invites")
    .insert({ org_id: orgId, email, role, invited_by: owner.id })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

let owner: Actor;
let newcomer: Actor; // never had an account or a workspace before the invite
let veteran: Actor; // already owns a workspace of their own
let ownerOrg: string;
let veteranOrg: string;
const orgIds: string[] = [];
const userIds: string[] = [];

beforeAll(async () => {
  owner = await makeActor("owner");
  newcomer = await makeActor("newcomer");
  veteran = await makeActor("veteran");
  userIds.push(owner.id, newcomer.id, veteran.id);

  ownerOrg = await createOrg(owner, `Invite Test Owner ${stamp}`);
  veteranOrg = await createOrg(veteran, `Invite Test Veteran ${stamp}`);
  orgIds.push(ownerOrg, veteranOrg);
}, 60_000);

afterAll(async () => {
  for (const id of orgIds) await admin.from("organizations").delete().eq("id", id);
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
}, 60_000);

describe("accept_invite — identity", () => {
  it("refuses an invitation addressed to someone else, even with a valid session", async () => {
    // Addressed to the newcomer; the veteran holds a real, fully valid session
    // and knows the invitation id. That is exactly the attack this guards.
    const id = await invite(owner, ownerOrg, newcomer.email, "member");

    const { error } = await veteran.client.rpc("accept_invite", { _invite_id: id });
    expect(error?.message ?? "").toMatch(/invitation not found/i);

    const { data: rows } = await admin
      .from("memberships")
      .select("user_id")
      .eq("org_id", ownerOrg)
      .eq("user_id", veteran.id);
    expect(rows ?? []).toHaveLength(0);

    const { data: inv } = await admin
      .from("org_invites")
      .select("accepted_at, accepted_by")
      .eq("id", id)
      .single();
    expect(inv?.accepted_at).toBeNull();
    expect(inv?.accepted_by).toBeNull();

    await admin.from("org_invites").delete().eq("id", id);
  }, 30_000);

  it("hides invitations addressed to other people from the reader", async () => {
    const id = await invite(owner, ownerOrg, newcomer.email, "member");

    const { data: seenByStranger } = await veteran.client
      .from("org_invites")
      .select("id")
      .eq("id", id);
    expect(seenByStranger ?? []).toHaveLength(0);

    const { data: seenByInvitee } = await newcomer.client
      .from("org_invites")
      .select("id")
      .eq("id", id);
    expect((seenByInvitee ?? []).map((r) => r.id)).toEqual([id]);

    await admin.from("org_invites").delete().eq("id", id);
  }, 30_000);

  it("refuses an invitation sent into a workspace the sender does not manage", async () => {
    const { error } = await veteran.client
      .from("org_invites")
      .insert({ org_id: ownerOrg, email: addr("outsider"), role: "member", invited_by: veteran.id });
    expect(error).not.toBeNull();
  }, 30_000);
});

describe("accept_invite — the two acceptance paths", () => {
  it("adds a brand-new user, who had no workspace at all, as a member", async () => {
    const before = await admin.from("memberships").select("org_id").eq("user_id", newcomer.id);
    expect(before.data ?? []).toHaveLength(0);

    const id = await invite(owner, ownerOrg, newcomer.email, "member");
    const { data: orgId, error } = await newcomer.client.rpc("accept_invite", { _invite_id: id });
    expect(error).toBeNull();
    expect(orgId).toBe(ownerOrg);

    const after = await admin.from("memberships").select("org_id").eq("user_id", newcomer.id);
    expect((after.data ?? []).map((r) => r.org_id)).toEqual([ownerOrg]);

    const role = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", newcomer.id)
      .eq("org_id", ownerOrg);
    expect((role.data ?? []).map((r) => r.role)).toEqual(["member"]);
  }, 30_000);

  it("adds an existing user who already owns a workspace, without disturbing their own", async () => {
    const id = await invite(owner, ownerOrg, veteran.email, "admin");
    const { data: orgId, error } = await veteran.client.rpc("accept_invite", { _invite_id: id });
    expect(error).toBeNull();
    expect(orgId).toBe(ownerOrg);

    const memberships = await admin.from("memberships").select("org_id").eq("user_id", veteran.id);
    expect(new Set((memberships.data ?? []).map((r) => r.org_id))).toEqual(
      new Set([veteranOrg, ownerOrg]),
    );

    // Their own workspace still belongs to them, unchanged by joining another.
    const own = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", veteran.id)
      .eq("org_id", veteranOrg);
    expect((own.data ?? []).map((r) => r.role)).toEqual(["owner"]);
  }, 30_000);

  it("lands the role the invitation specified, not a default", async () => {
    const joined = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", veteran.id)
      .eq("org_id", ownerOrg);
    expect((joined.data ?? []).map((r) => r.role)).toEqual(["admin"]);
  }, 30_000);
});

describe("accept_invite — single use, revocation, expiry", () => {
  it("cannot be replayed once it has been accepted", async () => {
    const used = await admin
      .from("org_invites")
      .select("id")
      .eq("org_id", ownerOrg)
      .eq("email", veteran.email)
      .not("accepted_at", "is", null)
      .single();
    expect(used.data?.id).toBeTruthy();

    const { error } = await veteran.client.rpc("accept_invite", { _invite_id: used.data!.id });
    expect(error?.message ?? "").toMatch(/already used/i);
  }, 30_000);

  it("cannot be accepted after the workspace revokes it", async () => {
    const stranger = await makeActor("revoked");
    userIds.push(stranger.id);
    const id = await invite(owner, ownerOrg, stranger.email, "member");

    // Revoked through the real manager path, not a service-role shortcut.
    const revoke = await owner.client
      .from("org_invites")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id);
    expect(revoke.error).toBeNull();

    const { error } = await stranger.client.rpc("accept_invite", { _invite_id: id });
    expect(error?.message ?? "").toMatch(/revoked/i);

    const rows = await admin
      .from("memberships")
      .select("user_id")
      .eq("org_id", ownerOrg)
      .eq("user_id", stranger.id);
    expect(rows.data ?? []).toHaveLength(0);
  }, 60_000);

  it("cannot be accepted after it expires", async () => {
    const latecomer = await makeActor("expired");
    userIds.push(latecomer.id);
    const id = await invite(owner, ownerOrg, latecomer.email, "member");

    await admin
      .from("org_invites")
      .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("id", id);

    const { error } = await latecomer.client.rpc("accept_invite", { _invite_id: id });
    expect(error?.message ?? "").toMatch(/expired/i);

    const rows = await admin
      .from("memberships")
      .select("user_id")
      .eq("org_id", ownerOrg)
      .eq("user_id", latecomer.id);
    expect(rows.data ?? []).toHaveLength(0);
  }, 60_000);
});
