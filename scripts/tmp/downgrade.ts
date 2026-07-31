import { createHmac } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { createStripeClient } from "../../src/lib/stripe.server";
import { resolvePlan } from "../../src/lib/billing/guard.server";

const ORG = process.argv[2]!;
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const stripe = createStripeClient("sandbox");
const URL = "https://project--e64eb6e2-38b5-4107-b0fb-2e2b0ab7a1d4-dev.lovable.app/api/public/payments/webhook?env=sandbox";

const { data: org } = await db.from("organizations").select("stripe_subscription_id").eq("id", ORG).single();
const subId = org!.stripe_subscription_id as string;

// 1. Real cancellation through Stripe. The paid period is still running, so the
//    workspace must keep the rung it paid for.
await stripe.subscriptions.cancel(subId);
await new Promise((r) => setTimeout(r, 12000));
console.log("after real cancel:", (await db.from("organizations").select("plan, plan_valid_until").eq("id", ORG).single()).data,
  "| effective:", await resolvePlan(db as any, ORG, "sandbox"),
  "| sub status:", (await db.from("subscriptions").select("status, current_period_end").eq("org_id", ORG).single()).data);

// 2. The event the provider sends once that period is actually over. Signed for
//    real — the endpoint rejects anything unsigned.
const live = await stripe.subscriptions.retrieve(subId);
const past = Math.floor(Date.now() / 1000) - 60;
const body = JSON.stringify({
  type: "customer.subscription.updated",
  data: { object: { ...live, status: "canceled", cancel_at_period_end: true,
    items: { data: [{ ...(live as any).items.data[0], current_period_end: past }] },
    current_period_end: past } },
});
const t = Math.floor(Date.now() / 1000);
const sig = createHmac("sha256", process.env.PAYMENTS_SANDBOX_WEBHOOK_SECRET!).update(`${t}.${body}`).digest("hex");
const res = await fetch(URL, { method: "POST", headers: { "stripe-signature": `t=${t},v1=${sig}`, "content-type": "application/json" }, body });
console.log("period-end event ->", res.status, await res.text());

// Unsigned attempt, to show the endpoint is not open.
const bad = await fetch(URL, { method: "POST", headers: { "content-type": "application/json" }, body });
console.log("unsigned attempt ->", bad.status);

await new Promise((r) => setTimeout(r, 2000));
console.log("after period end:", (await db.from("organizations").select("plan").eq("id", ORG).single()).data,
  "| effective:", await resolvePlan(db as any, ORG, "sandbox"));
