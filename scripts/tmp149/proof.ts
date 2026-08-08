/**
 * Dispatch 149 — proof matrix for demo access.
 *
 * Calls the real server function over HTTP, exactly as the browser does, for
 * every arm of the matrix. Creates its own throwaway accounts and partner, and
 * removes them again at the end.
 */
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL!;
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY!;

const FN =
  "eyJmaWxlIjoiL3NyYy9saWIvZGFzaGJvYXJkLmZ1bmN0aW9ucy50cz90c3Mtc2VydmVyZm4tc3BsaXQiLCJleHBvcnQiOiJnZXREYXNoYm9hcmRTbmFwc2hvdF9jcmVhdGVTZXJ2ZXJGbl9oYW5kbGVyIn0";
const PAYLOAD =
  '{"t":{"t":10,"i":0,"p":{"k":["data"],"v":[{"t":10,"i":1,"p":{"k":["days","objective"],"v":[{"t":0,"s":30},{"t":1,"s":"cost"}]},"o":0}]},"o":0},"f":63,"m":[]}';

async function call(token: string | null) {
  const res = await fetch(
    `http://localhost:8080/_serverFn/${FN}?payload=${encodeURIComponent(PAYLOAD)}`,
    { headers: { origin: "http://localhost:8080", ...(token ? { authorization: `Bearer ${token}` } : {}) } },
  );
  const text = await res.text();
  let spend: number | null = null;
  try {
    spend = JSON.parse(text)?.result?.totals?.spend ?? JSON.parse(text)?.totals?.spend ?? null;
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, spend, body: text.slice(0, 120) };
}

async function makeUser(email: string) {
  const pass = `D149-${crypto.randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: pass,
    email_confirm: true,
  });
  if (error) throw error;
  const pub = createClient(URL_, anonKey, { auth: { persistSession: false } });
  const signIn = await pub.auth.signInWithPassword({ email, password: pass });
  if (signIn.error) throw signIn.error;
  return { id: data.user!.id, token: signIn.data.session!.access_token };
}

const results: Record<string, unknown> = {};

const nonPartner = await makeUser(`d149-nonpartner-${Date.now()}@costmyai.test`);
const partnerUser = await makeUser(`d149-partner-${Date.now()}@costmyai.test`);

const { data: partner, error: pErr } = await admin
  .from("partners")
  .insert({ name: "D149 Proof Partner", referral_code: `D149PROOF${Date.now() % 100000}`, status: "active" })
  .select("id")
  .single();
if (pErr) throw pErr;
const { error: puErr } = await admin
  .from("partner_users")
  .insert({ partner_id: partner.id, user_id: partnerUser.id, role: "owner" });
if (puErr) throw puErr;

results["1_anonymous"] = await call(null);
results["2_signed_in_non_partner"] = await call(nonPartner.token);
results["3_active_partner"] = await call(partnerUser.token);

// Mid-session revocation: same token, partnership suspended.
await admin.from("partners").update({ status: "suspended" }).eq("id", partner.id);
results["4_suspended_partner_same_token"] = await call(partnerUser.token);

// Re-activate to show it is the status, not the token, doing the work.
await admin.from("partners").update({ status: "active" }).eq("id", partner.id);
results["5_reactivated_partner"] = await call(partnerUser.token);

// Workspace isolation: what each audience actually read.
const totals = async (orgId: string) => {
  const { data } = await admin
    .from("usage_rollups")
    .select("cost_usd")
    .eq("org_id", orgId)
    .eq("granularity", "day");
  return (data ?? []).reduce((s, r) => s + Number(r.cost_usd), 0);
};
results["db_internal_org_day_spend"] = await totals("00000000-0000-0000-0000-000000000001");
results["db_partner_org_day_spend"] = await totals("00000000-0000-0000-0000-000000000002");

console.log(JSON.stringify(results, null, 2));

// Cleanup.
await admin.from("partner_users").delete().eq("partner_id", partner.id);
await admin.from("partners").delete().eq("id", partner.id);
await admin.auth.admin.deleteUser(nonPartner.id);
await admin.auth.admin.deleteUser(partnerUser.id);
console.log("cleaned up");
