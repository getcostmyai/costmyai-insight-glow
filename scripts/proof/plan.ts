import { createClient } from "@supabase/supabase-js";
const ORG = "99488dd8-9fd3-4861-9d55-44f186ca2e56";
function keyFetch(key: string): typeof fetch {
  return (input, init) => { const h = new Headers(init?.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
}
const SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
const admin = createClient(process.env["SUPABASE_URL"]!, SERVICE, { global: { fetch: keyFetch(SERVICE) }, auth: { persistSession: false } });
const end = new Date(Date.now() + 30 * 86400000).toISOString();
const { data: sub, error: se } = await admin.from("subscriptions").insert({
  org_id: ORG, stripe_subscription_id: `sub_proof_${Date.now()}`, stripe_customer_id: `cus_proof_${Date.now()}`,
  price_id: "price_proof_govern", plan: "govern", status: "active", current_period_start: new Date().toISOString(),
  current_period_end: end, environment: "sandbox",
}).select("id,plan,status,environment,current_period_end").single();
if (se) throw se;
const { data: org, error: oe } = await admin.from("organizations").update({ plan: "govern" }).eq("id", ORG).select("id,name,plan").single();
if (oe) throw oe;
console.log(JSON.stringify({ sub, org }, null, 2));
