/**
 * Dispatch 133 — temporary partner proof harness. Deleted after the run.
 * Every step goes through the real path: the real approval RPC, the real
 * self-link RPC, the real attach_referral, the real accrue_commission.
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env["SUPABASE_URL"]!;
const SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
const PUB = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
const ROBIN = process.env["LOVABLE_BROWSER_SUPABASE_ACCESS_TOKEN"]!;

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });
const asRobin = createClient(URL, PUB, {
  auth: { persistSession: false },
  global: { headers: { Authorization: `Bearer ${ROBIN}` } },
});

const TAG = "d133";
const PARTNER_EMAIL = `d133-partner@costmyai-test.invalid`;
const CLIENT_EMAIL = `d133-client@costmyai-test.invalid`;
const PW = "D133-temp-proof-fixed-9f3a";

const log = (...a: unknown[]) => console.log(...a);
const j = (v: unknown) => JSON.stringify(v);

async function userClient(email: string) {
  const anon = createClient(URL, PUB, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(`signin ${email}: ${error.message}`);
  return {
    client: createClient(URL, PUB, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${data.session!.access_token}` } },
    }),
    session: data.session!,
    userId: data.user!.id,
  };
}

async function ensureUser(email: string) {
  const { data, error } = await svc.auth.admin.createUser({
    email,
    password: PW,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  return data.user!.id;
}

async function main() {
  const step = process.argv[2] ?? "all";

  if (step === "setup" || step === "all") {
    log("== step 1: application row (same shape the public form writes) ==");
    const app = await svc
      .from("partner_applications")
      .insert({
        first_name: "Temp",
        last_name: "Proof",
        email: PARTNER_EMAIL,
        phone: "+43 000 000 000",
        company: "D133 Proof Partner",
        active_clients_bucket: "11–50",
        starting_soon_bucket: "1",
        routed_path: "async",
        escalated: false,
      })
      .select("id")
      .single();
    if (app.error) throw app.error;
    log("application id", app.data.id);

    log("== step 2: real approval pipeline as platform admin ==");
    const prov = await asRobin.rpc("provision_partner_from_application", {
      _application_id: app.data.id,
    });
    if (prov.error) throw prov.error;
    log("provision_partner_from_application ->", j(prov.data));

    log("== step 3: temp auth users, real self-link RPC ==");
    const partnerUid = await ensureUser(PARTNER_EMAIL);
    const clientUid = await ensureUser(CLIENT_EMAIL);
    log("partner user", partnerUid, "client user", clientUid);

    const p = await userClient(PARTNER_EMAIL);
    const claim = await p.client.rpc("claim_partner_membership");
    if (claim.error) throw claim.error;
    log("claim_partner_membership ->", j(claim.data));
    log("PARTNER_SESSION", j({ access_token: p.session.access_token.slice(0, 12) + "…" }));
    await Bun.write(
      "/tmp/d133-partner-session.json",
      JSON.stringify(p.session),
    );

    log("== step 4: referred workspace, created by the temp client user ==");
    const c = await userClient(CLIENT_EMAIL);
    const org = await c.client.rpc("create_organization", { _name: "D133 Referred Workspace" });
    if (org.error) throw org.error;
    log("org", org.data);
    await Bun.write("/tmp/d133-ids.json", JSON.stringify({
      applicationId: app.data.id,
      partner: prov.data,
      partnerUid,
      clientUid,
      orgId: org.data,
    }));
  }

  const ids = JSON.parse(await Bun.file("/tmp/d133-ids.json").text());
  const partnerId = (ids.partner as { partner_id: string }).partner_id;
  const code = (ids.partner as { referral_code: string }).referral_code;

  if (step === "refer" || step === "all") {
    log("== step 5: real /r/CODE click, then attach through the cookie's code ==");
    const res = await fetch(`https://costmyai-insight-glow.lovable.app/r/${code}`, {
      redirect: "manual",
    });
    const setCookie = res.headers.get("set-cookie");
    log("/r/" + code, res.status, "set-cookie:", setCookie);

    const c = await userClient(CLIENT_EMAIL);
    const cookieCode = /cma_ref=([^;]+)/.exec(setCookie ?? "")?.[1];
    const att = await c.client.rpc("attach_referral", {
      _org_id: ids.orgId,
      _code: decodeURIComponent(cookieCode ?? ""),
    });
    log("attach_referral ->", j(att.data ?? att.error?.message));

    log("-- isolation: can the client read the partner's figures? --");
    const leak = await c.client.rpc("partner_summary", { _partner_id: partnerId });
    log("partner_summary as referred client ->", j(leak.data), leak.error?.message ?? "");
    const leak2 = await c.client.from("commission_ledger").select("id").eq("partner_id", partnerId);
    log("commission_ledger as referred client ->", j(leak2.data), leak2.error?.message ?? "");
  }

  if (step === "tier" || step === "all") {
    log("== step 6: tier progression from real ledger revenue ==");
    const p = await userClient(PARTNER_EMAIL);
    const show = async (label: string) => {
      const s = await p.client.rpc("partner_summary", { _partner_id: partnerId }).maybeSingle();
      log(label, j(s.data));
    };
    await show("before any commission:");

    // Below the Bronze threshold.
    let r = await svc.rpc("accrue_commission", {
      _org_id: ids.orgId,
      _invoice_id: `in_${TAG}_a`,
      _revenue_usd: 4000,
      _environment: "sandbox",
    });
    log("accrue $4,000 ->", j(r.data), r.error?.message ?? "");
    await show("after $4,000 (expect tier 0 / 15%):");

    // Crosses $5,000 -> Bronze / 20%.
    r = await svc.rpc("accrue_commission", {
      _org_id: ids.orgId,
      _invoice_id: `in_${TAG}_b`,
      _revenue_usd: 1500,
      _environment: "sandbox",
    });
    log("accrue $1,500 ->", j(r.data), r.error?.message ?? "");
    await show("after $5,500 (expect tier 1 / 20%):");

    const rows = await p.client
      .from("commission_ledger")
      .select("invoice_id, revenue_usd, rate_pct, commission_usd, status, payout_id")
      .eq("partner_id", partnerId)
      .order("created_at");
    log("ledger:", j(rows.data));
  }

  if (step === "payout" || step === "all") {
    log("== step 7: the payout run reads the very rows accrue_commission wrote ==");
    // payout_begin's own selection criteria, run verbatim against this partner.
    const pending = await svc
      .from("commission_ledger")
      .select("id, invoice_id, commission_usd")
      .eq("partner_id", partnerId)
      .eq("environment", "sandbox")
      .eq("status", "pending")
      .is("payout_id", null);
    log("rows payout_begin would reserve:", j(pending.data));

    // Give the temp partner the same sandbox Connect account Dispatch 129 used,
    // then let payout_begin reserve for real (no Stripe call is made here).
    await svc
      .from("partners")
      .update({
        stripe_connect_account_id: "acct_1TwRfvBFjkfGLhqR",
        stripe_connect_status: "active",
        stripe_connect_environment: "sandbox",
      })
      .eq("id", partnerId);
    const begin = await svc.rpc("payout_begin", {
      _partner_id: partnerId,
      _environment: "sandbox",
      _actor: ids.partnerUid,
    });
    log("payout_begin ->", j(begin.data), begin.error?.message ?? "");
    const after = await svc
      .from("commission_ledger")
      .select("invoice_id, status, payout_id")
      .eq("partner_id", partnerId);
    log("ledger after reservation:", j(after.data));
  }

  if (step === "cleanup" || step === "all") {
    log("== cleanup ==");
    await svc.from("commission_ledger").delete().eq("partner_id", partnerId);
    await svc.from("partner_payouts").delete().eq("partner_id", partnerId);
    await svc.from("partner_tier_audit").delete().eq("partner_id", partnerId);
    await svc.from("partner_users").delete().eq("partner_id", partnerId);
    await svc.from("organizations").update({ referred_by_partner_id: null }).eq("id", ids.orgId);
    await svc.from("memberships").delete().eq("org_id", ids.orgId);
    await svc.from("user_roles").delete().eq("org_id", ids.orgId);
    await svc.from("organizations").delete().eq("id", ids.orgId);
    await svc.from("partners").delete().eq("id", partnerId);
    await svc.from("partner_applications").delete().eq("id", ids.applicationId);
    await svc.auth.admin.deleteUser(ids.partnerUid);
    await svc.auth.admin.deleteUser(ids.clientUid);
    log("cleanup done");
  }
}

main().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
