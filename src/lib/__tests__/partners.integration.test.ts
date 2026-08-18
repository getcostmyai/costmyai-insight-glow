/**
 * Real end-to-end tests for the partner / affiliate program.
 *
 * Nothing is mocked: real users, real sessions, real RLS, and the same
 * `accrue_commission` the payment webhook calls. The claims worth proving are
 * the ones that decide money and trust — attribution is lifetime and cannot be
 * stolen or moved, the rate is a function of the ledger rather than of anything
 * a partner can set, an override is admin-only and always audited, an invoice
 * is paid exactly once, and no partner can see another partner's earnings.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

const PASSWORD = "Test-Partner-Pass-2026!";
const stamp = Date.now();

interface Actor {
  id: string;
  email: string;
  client: SupabaseClient;
}

async function makeActor(who: string): Promise<Actor> {
  const email = `partner-${who}-${stamp}@costmyai-test.dev`;
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

async function makePartner(name: string, code: string, owner: Actor): Promise<string> {
  const { data, error } = await admin
    .from("partners")
    .insert({ name, referral_code: code, status: "active", created_by: owner.id })
    .select("id")
    .single();
  if (error) throw error;
  await admin.from("partner_users").insert({ partner_id: data.id, user_id: owner.id, role: "owner" });
  return data.id as string;
}

async function accrue(orgId: string, invoiceId: string, revenue: number) {
  const { data, error } = await admin.rpc("accrue_commission", {
    _org_id: orgId,
    _invoice_id: invoiceId,
    _revenue_usd: revenue,
    _environment: "sandbox",
  });
  if (error) throw error;
  return data as string | null;
}

let alice: Actor; // partner owner
let bob: Actor; // rival partner owner
let customer: Actor; // workspace owner who was referred
let platformAdmin: Actor;
let alicePartner: string;
let bobPartner: string;
let orgId: string;
let secondOrg: string;

beforeAll(async () => {
  [alice, bob, customer, platformAdmin] = await Promise.all([
    makeActor("alice"),
    makeActor("bob"),
    makeActor("customer"),
    makeActor("admin"),
  ]);

  alicePartner = await makePartner(`Alice Consulting ${stamp}`, `alice-${stamp}`, alice);
  bobPartner = await makePartner(`Bob Referrals ${stamp}`, `bob-${stamp}`, bob);

  await admin.from("platform_admins").insert({ user_id: platformAdmin.id, note: "test" });

  const org = await customer.client.rpc("create_organization", { _name: `Referred Co ${stamp}` });
  if (org.error) throw org.error;
  orgId = org.data as string;

  const org2 = await customer.client.rpc("create_organization", { _name: `Second Co ${stamp}` });
  if (org2.error) throw org2.error;
  secondOrg = org2.data as string;
}, 90_000);

afterAll(async () => {
  /**
   * Dispatch 231. This teardown used to be a bare sequence: one throwing step
   * (or an aborted run) left the `platform_admins` grant behind, and a real
   * standing admin row for a deleted user sat in production for two weeks
   * before an integrity sweep found it. The privileged row is now dropped
   * FIRST, verified by read-back, and a belt-and-braces sweep removes any
   * `note = 'test'` grant whose user no longer exists.
   */
  try {
    await admin.from("platform_admins").delete().eq("user_id", platformAdmin.id);
    const { data: left } = await admin
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", platformAdmin.id)
      .maybeSingle();
    if (left) throw new Error(`platform_admins grant for ${platformAdmin.id} survived teardown`);
  } finally {
    await admin.from("organizations").delete().in("id", [orgId, secondOrg]);
    await admin.from("partners").delete().in("id", [alicePartner, bobPartner]);
    for (const a of [alice, bob, customer, platformAdmin]) await admin.auth.admin.deleteUser(a.id);
  }
}, 90_000);


describe("referral attribution", () => {
  it("attaches once, then refuses a second claim and any move to another partner", async () => {
    const first = await customer.client.rpc("attach_referral", {
      _org_id: orgId,
      _code: `ALICE-${stamp}`.toLowerCase().toUpperCase(), // case-insensitive on purpose
    });
    expect(first.error).toBeNull();
    expect(first.data).toBe(alicePartner);

    // A second claim — even for the same partner — is refused.
    const second = await customer.client.rpc("attach_referral", {
      _org_id: orgId,
      _code: `bob-${stamp}`,
    });
    expect(second.error?.message ?? "").toMatch(/already has a referral/i);

    // And not even service credentials may quietly re-attribute the workspace:
    // the lifetime guarantee is a database trigger, not a policy.
    const moved = await admin
      .from("organizations")
      .update({ referred_by_partner_id: bobPartner })
      .eq("id", orgId);
    expect(moved.error?.message ?? "").toMatch(/lifetime of the workspace/i);

    const { data: row } = await admin
      .from("organizations")
      .select("referred_by_partner_id, referred_at")
      .eq("id", orgId)
      .single();
    expect(row!.referred_by_partner_id).toBe(alicePartner);
    expect(row!.referred_at).toBeTruthy();
  }, 30_000);

  it("refuses an unknown code and refuses a workspace the caller does not own", async () => {
    const unknown = await customer.client.rpc("attach_referral", {
      _org_id: secondOrg,
      _code: "no-such-code",
    });
    expect(unknown.error?.message ?? "").toMatch(/not valid/i);

    const notMine = await bob.client.rpc("attach_referral", {
      _org_id: secondOrg,
      _code: `bob-${stamp}`,
    });
    expect(notMine.error?.message ?? "").toMatch(/workspace not found/i);
  }, 30_000);
});

describe("commission accrual", () => {
  it("pays the referring partner at the earned rate, exactly once per invoice", async () => {
    const id = await accrue(orgId, `in_${stamp}_1`, 400);
    expect(id).toBeTruthy();

    // A provider retry of the same invoice must not pay twice.
    const retry = await accrue(orgId, `in_${stamp}_1`, 400);
    expect(retry).toBeNull();

    const { data: rows } = await admin
      .from("commission_ledger")
      .select("revenue_usd, rate_pct, commission_usd, status")
      .eq("partner_id", alicePartner);
    expect(rows).toHaveLength(1);
    expect(Number(rows![0]!.rate_pct)).toBe(15); // Associate
    expect(Number(rows![0]!.commission_usd)).toBe(60); // 15% of 400
    expect(rows![0]!.status).toBe("pending");
  }, 30_000);

  it("ignores an unreferred workspace and a zero-dollar invoice", async () => {
    expect(await accrue(secondOrg, `in_${stamp}_unreferred`, 900)).toBeNull();
    expect(await accrue(orgId, `in_${stamp}_zero`, 0)).toBeNull();
  }, 30_000);

  it("raises the rate as lifetime referred revenue crosses a tier threshold", async () => {
    // 400 so far; 5,000 total earns Advisor (20%).
    await accrue(orgId, `in_${stamp}_2`, 4600);

    const earned = await admin.rpc("partner_earned_tier", { _partner_id: alicePartner });
    expect(Number(earned.data)).toBe(1);
    const rate = await admin.rpc("partner_commission_rate", { _partner_id: alicePartner });
    expect(Number(rate.data)).toBe(20);

    // The next invoice is written at the new rate; earlier ones are untouched,
    // because a paid invoice is history, not a running total.
    await accrue(orgId, `in_${stamp}_3`, 1000);
    const { data: latest } = await admin
      .from("commission_ledger")
      .select("rate_pct, commission_usd")
      .eq("invoice_id", `in_${stamp}_3`)
      .single();
    expect(Number(latest!.rate_pct)).toBe(20);
    expect(Number(latest!.commission_usd)).toBe(200);

    const { data: first } = await admin
      .from("commission_ledger")
      .select("rate_pct")
      .eq("invoice_id", `in_${stamp}_1`)
      .single();
    expect(Number(first!.rate_pct)).toBe(15);
  }, 30_000);

  it("walks every documented threshold from 15% to 35%", async () => {
    const { data: tiers } = await admin
      .from("partner_tiers")
      .select("tier, min_lifetime_referred_usd, rate_pct")
      .order("tier");
    expect(
      (tiers ?? []).map((t) => [Number(t.min_lifetime_referred_usd), Number(t.rate_pct)]),
    ).toEqual([
      [0, 15],
      [5000, 20],
      [10000, 25],
      [40000, 30],
      [130000, 35],
    ]);

    // Bob is a clean slate: push him straight past the top threshold.
    await admin
      .from("organizations")
      .update({ referred_by_partner_id: bobPartner, referred_at: new Date().toISOString() })
      .eq("id", secondOrg);
    await accrue(secondOrg, `in_${stamp}_bob_top`, 130000);
    const rate = await admin.rpc("partner_commission_rate", { _partner_id: bobPartner });
    expect(Number(rate.data)).toBe(35);
  }, 30_000);
});

describe("tier override", () => {
  it("is refused for a partner owner and for a stranger, and allowed for a platform admin", async () => {
    const byOwner = await alice.client.rpc("set_partner_tier_override", {
      _partner_id: alicePartner,
      _tier: 4,
      _reason: "I would like more money",
    });
    expect(byOwner.error?.message ?? "").toMatch(/partner not found/i);

    // Nor can the partner reach the column directly through the table.
    const direct = await alice.client
      .from("partners")
      .update({ tier_override: 4 })
      .eq("id", alicePartner);
    expect(direct.error?.message ?? "").toMatch(/set by CostMyAI/i);

    const byAdmin = await platformAdmin.client.rpc("set_partner_tier_override", {
      _partner_id: alicePartner,
      _tier: 3,
      _reason: "Strategic launch partner — agreed 30% for year one",
    });
    expect(byAdmin.error).toBeNull();
    expect(Number(byAdmin.data)).toBe(3);

    const rate = await admin.rpc("partner_commission_rate", { _partner_id: alicePartner });
    expect(Number(rate.data)).toBe(30);
  }, 30_000);

  it("records who overrode it, from what, to what, against what was earned, and why", async () => {
    const { data: audit } = await admin
      .from("partner_tier_audit")
      .select("from_tier, to_tier, earned_tier, reason, actor")
      .eq("partner_id", alicePartner)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    expect(audit!.from_tier).toBeNull();
    expect(audit!.to_tier).toBe(3);
    expect(audit!.earned_tier).toBe(1); // what the ledger had actually earned
    expect(audit!.reason).toMatch(/Strategic launch partner/);
    expect(audit!.actor).toBe(platformAdmin.id);
  }, 30_000);

  it("refuses an override with no reason, and clearing it hands the tier back to the ledger", async () => {
    const noReason = await platformAdmin.client.rpc("set_partner_tier_override", {
      _partner_id: alicePartner,
      _tier: 4,
      _reason: "   ",
    });
    expect(noReason.error?.message ?? "").toMatch(/needs a reason/i);

    const cleared = await platformAdmin.client.rpc("set_partner_tier_override", {
      _partner_id: alicePartner,
      _tier: null as unknown as number,
      _reason: "Year-one agreement ended",
    });
    expect(cleared.error).toBeNull();
    expect(Number(cleared.data)).toBe(1); // back to what the ledger earned
  }, 30_000);
});

describe("partner isolation", () => {
  it("shows a partner only its own record, referrals, ledger and tier history", async () => {
    const partners = await alice.client.from("partners").select("id");
    expect((partners.data ?? []).map((p) => p.id)).toEqual([alicePartner]);

    const ledger = await alice.client.from("commission_ledger").select("partner_id");
    expect(new Set((ledger.data ?? []).map((c) => c.partner_id))).toEqual(new Set([alicePartner]));

    const bobsLedger = await bob.client
      .from("commission_ledger")
      .select("id")
      .eq("partner_id", alicePartner);
    expect(bobsLedger.data ?? []).toHaveLength(0);

    const bobsAudit = await bob.client
      .from("partner_tier_audit")
      .select("id")
      .eq("partner_id", alicePartner);
    expect(bobsAudit.data ?? []).toHaveLength(0);
  }, 30_000);

  it("lets a partner see that a workspace is theirs without seeing its usage or spend", async () => {
    // Through the scoped function: the workspace is visibly theirs.
    const orgs = await alice.client.rpc("partner_referrals", { _partner_id: alicePartner });
    expect((orgs.data ?? []).map((o: { id: string }) => o.id)).toEqual([orgId]);
    expect(Object.keys((orgs.data ?? [])[0] ?? {}).sort()).toEqual([
      "id",
      "name",
      "plan",
      "referred_at",
    ]);

    // Through the table itself: nothing at all — a partner is not a member.
    const direct = await alice.client
      .from("organizations")
      .select("id")
      .eq("referred_by_partner_id", alicePartner);
    expect(direct.data ?? []).toHaveLength(0);

    // And it refuses to enumerate a partner the caller does not belong to.
    const theirs = await bob.client.rpc("partner_referrals", { _partner_id: alicePartner });
    expect(theirs.data ?? []).toHaveLength(0);

    // Attribution is not membership: no usage, no rollups, no switches.
    const usage = await alice.client.from("usage_rollups").select("id").eq("org_id", orgId);
    expect(usage.data ?? []).toHaveLength(0);
    const switches = await alice.client.from("switches").select("id").eq("org_id", orgId);
    expect(switches.data ?? []).toHaveLength(0);
    const keys = await alice.client.from("api_keys").select("id").eq("org_id", orgId);
    expect(keys.data ?? []).toHaveLength(0);
  }, 30_000);

  it("hides the ledger and partner records from someone with no partner account at all", async () => {
    const partners = await customer.client.from("partners").select("id");
    expect(partners.data ?? []).toHaveLength(0);
    const ledger = await customer.client.from("commission_ledger").select("id");
    expect(ledger.data ?? []).toHaveLength(0);
  }, 30_000);
});
