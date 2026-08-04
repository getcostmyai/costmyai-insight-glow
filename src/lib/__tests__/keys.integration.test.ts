/**
 * Real end-to-end tests for workspace ingest tokens.
 *
 * Nothing here is mocked: tokens are minted through the same code the Settings
 * page calls, then presented to the same authenticator the public ingest route
 * uses. The claims worth proving are exactly the ones a customer depends on —
 * the raw token exists once, the database only ever holds its hash, a rotated
 * token replaces the old one without a gap, and a revoked token stops working
 * on the very next request.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { authenticateApiKey } from "@/lib/ingest/ingest.server";
import { listApiKeys, mintApiKey, revokeApiKey, rotateApiKey } from "@/lib/ingest/keys.server";
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

const PASSWORD = "Test-Token-Pass-2026!";
const stamp = Date.now();

interface Actor {
  id: string;
  email: string;
  client: SupabaseClient;
}

async function makeActor(who: string): Promise<Actor> {
  const email = `token-${who}-${stamp}@costmyai-test.dev`;
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
  return { id: created.data.user!.id, email, client };
}

let owner: Actor;
let stranger: Actor;
let orgId: string;

beforeAll(async () => {
  owner = await makeActor("owner");
  stranger = await makeActor("stranger");
  const { data, error } = await owner.client.rpc("create_organization", {
    _name: `Token Test ${stamp}`,
  });
  if (error) throw error;
  orgId = data as string;
}, 60_000);

afterAll(async () => {
  await admin.from("organizations").delete().eq("id", orgId);
  await admin.auth.admin.deleteUser(owner.id);
  await admin.auth.admin.deleteUser(stranger.id);
}, 60_000);

describe("ingest tokens", () => {
  it("mints a token that is shown once and stored only as a hash", async () => {
    const minted = await mintApiKey(orgId, "Production gateway", owner.id);
    expect(minted.token).toMatch(/^cma_live_[0-9a-f]{48}$/);

    const { data: row } = await admin
      .from("api_keys")
      .select("key_hash, key_prefix, name, revoked_at")
      .eq("id", minted.id)
      .single();

    // The stored value is the hash, and the raw token appears in no column.
    expect(row!.key_hash).toBe(createHash("sha256").update(minted.token).digest("hex"));
    expect(JSON.stringify(row)).not.toContain(minted.token);
    expect(row!.key_prefix).toBe(minted.token.slice(0, 8));
    expect(row!.revoked_at).toBeNull();

    // And it authenticates against the ingest route's own authenticator.
    const authed = await authenticateApiKey(minted.token);
    expect(authed?.orgId).toBe(orgId);

    await admin.from("api_keys").delete().eq("id", minted.id);
  }, 30_000);

  it("rotation mints the replacement before killing the old token", async () => {
    const first = await mintApiKey(orgId, "Rotating gateway", owner.id);
    expect(await authenticateApiKey(first.token)).not.toBeNull();

    const second = await rotateApiKey(orgId, first.id, owner.id);
    expect(second.token).not.toBe(first.token);
    expect(second.name).toBe("Rotating gateway");

    // New one live, old one dead — the whole point of mint-then-revoke.
    expect((await authenticateApiKey(second.token))?.orgId).toBe(orgId);
    expect(await authenticateApiKey(first.token)).toBeNull();

    const list = await listApiKeys(orgId);
    expect(list.find((k) => k.id === first.id)?.revokedAt).toBeTruthy();
    expect(list.find((k) => k.id === second.id)?.revokedAt).toBeNull();

    await admin.from("api_keys").delete().in("id", [first.id, second.id]);
  }, 30_000);

  it("revocation takes effect on the next request", async () => {
    const key = await mintApiKey(orgId, "Doomed gateway", owner.id);
    expect(await authenticateApiKey(key.token)).not.toBeNull();

    await revokeApiKey(orgId, key.id);
    expect(await authenticateApiKey(key.token)).toBeNull();

    await admin.from("api_keys").delete().eq("id", key.id);
  }, 30_000);

  it("only managers of the workspace can see its tokens", async () => {
    const key = await mintApiKey(orgId, "Private gateway", owner.id);

    const mine = await owner.client.from("api_keys").select("id").eq("org_id", orgId);
    expect((mine.data ?? []).map((k) => k.id)).toContain(key.id);

    const theirs = await stranger.client.from("api_keys").select("id").eq("org_id", orgId);
    expect(theirs.data ?? []).toHaveLength(0);

    await admin.from("api_keys").delete().eq("id", key.id);
  }, 30_000);

  it("garbage and empty tokens authenticate as nobody", async () => {
    expect(await authenticateApiKey("")).toBeNull();
    expect(await authenticateApiKey("cma_live_not-a-real-token")).toBeNull();
  }, 30_000);
});
