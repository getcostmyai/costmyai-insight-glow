import crypto from "node:crypto";
import { supabaseAdmin } from "../src/integrations/supabase/client.server";

const SECRET = process.env["PAYMENTS_SANDBOX_WEBHOOK_SECRET"]!;
const URL = "http://localhost:8080/api/public/payments/webhook?env=sandbox";
const SUB = `sub_order_${Date.now()}`;
let ORG = "";

const now = Math.floor(Date.now() / 1000);
const T0 = now - 300, T1 = now - 200, T2 = now - 100;

function evt(type: string, created: number, status: string, price: string) {
  return {
    id: `evt_${type}_${created}`,
    type,
    created,
    data: {
      object: {
        id: SUB,
        object: "subscription",
        status,
        customer: "cus_order_test",
        cancel_at_period_end: false,
        metadata: { orgId: ORG, userId: "00000000-0000-0000-0000-000000000009" },
        items: { data: [{ current_period_start: T0, current_period_end: now + 86400 * 30,
          price: { id: "price_x", lookup_key: price, product: "prod_x" } }] },
      },
    },
  };
}

async function send(e: any) {
  const body = JSON.stringify(e);
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac("sha256", SECRET).update(`${t}.${body}`).digest("hex");
  const res = await fetch(URL, { method: "POST", body,
    headers: { "content-type": "application/json", "stripe-signature": `t=${t},v1=${sig}` } });
  return `${e.type}(created=${e.created},status=${e.data.object.status}) -> ${res.status} ${await res.text()}`;
}

async function state(label: string) {
  const s = await supabaseAdmin.from("subscriptions")
    .select("status, plan, last_event_created_at, last_event_id").eq("stripe_subscription_id", SUB).maybeSingle();
  const o = await supabaseAdmin.from("organizations").select("plan").eq("id", ORG).maybeSingle();
  console.log(`  ${label}: sub.status=${s.data?.status} sub.plan=${s.data?.plan} last_event=${s.data?.last_event_created_at} org.plan=${o.data?.plan}`);
  return { sub: s.data, org: o.data };
}

const org = await supabaseAdmin.from("organizations")
  .insert({ name: `Ordering ${Date.now()}`, slug: `ordering-${Date.now()}`, plan: "compare" })
  .select("id").single();
ORG = org.data!.id as string;
console.log("org", ORG, "sub", SUB);

console.log("\n1. in-order: created(active) then deleted");
console.log(" ", await send(evt("customer.subscription.created", T0, "active", "govern_monthly")));
await state("after created");
console.log(" ", await send(evt("customer.subscription.deleted", T1, "canceled", "govern_monthly")));
const cancelled = await state("after deleted");

console.log("\n2. THE HAZARD: stale updated(active) arriving after the cancellation");
console.log(" ", await send(evt("customer.subscription.updated", T0 + 10, "active", "govern_monthly")));
const after = await state("after stale update");
console.log("  RESURRECTED?", after.sub?.status !== "canceled" || after.org?.plan !== "compare");

console.log("\n3. a genuinely newer event still applies");
console.log(" ", await send(evt("customer.subscription.updated", T2, "active", "certify_monthly")));
await state("after fresh update");

console.log("\n4. tie in the same second: cancellation vs update, both created=T2+50");
console.log(" ", await send(evt("customer.subscription.deleted", T2 + 50, "canceled", "certify_monthly")));
console.log(" ", await send(evt("customer.subscription.updated", T2 + 50, "active", "certify_monthly")));
await state("after tie");

console.log("\n5. parallel isolates: 6 conflicting events fired simultaneously");
const T3 = now + 100;
const fired = await Promise.all([
  send(evt("customer.subscription.updated", T3, "active", "govern_monthly")),
  send(evt("customer.subscription.deleted", T3 + 1, "canceled", "govern_monthly")),
  send(evt("customer.subscription.updated", T3 - 5, "active", "certify_monthly")),
  send(evt("customer.subscription.updated", T3 + 2, "active", "rightsize_monthly")),
  send(evt("customer.subscription.updated", T3 - 50, "active", "govern_monthly")),
  send(evt("customer.subscription.deleted", T3 - 3, "canceled", "govern_monthly")),
]);
fired.forEach((f) => console.log("  ", f));
const final = await state("after parallel burst");
console.log("  converged to the newest event (T3+2 = rightsize active)?",
  final.sub?.status === "active" && final.sub?.plan === "rightsize" &&
  new Date(final.sub!.last_event_created_at as string).getTime() / 1000 === T3 + 2);

await supabaseAdmin.from("subscriptions").delete().eq("stripe_subscription_id", SUB);
await supabaseAdmin.from("org_stripe_customers").delete().eq("org_id", ORG);
await supabaseAdmin.from("organizations").delete().eq("id", ORG);
console.log("\ncleaned up");
