import { createStripeClient } from "/dev-server/src/lib/stripe.server";
import { createHmac } from "crypto";
const s = createStripeClient("sandbox");
const subId = process.argv[2];
const sub = await s.subscriptions.retrieve(subId, { expand: ["items.data.price"] });
const body = JSON.stringify({ id: "evt_d200_" + subId, type: "customer.subscription.updated", data: { object: sub } });
const t = Math.floor(Date.now() / 1000);
const sig = createHmac("sha256", process.env.PAYMENTS_SANDBOX_WEBHOOK_SECRET!).update(`${t}.${body}`).digest("hex");
const res = await fetch("http://localhost:8080/api/public/payments/webhook?env=sandbox", {
  method: "POST", headers: { "content-type": "application/json", "stripe-signature": `t=${t},v1=${sig}` }, body,
});
console.log(subId, (sub as any).status, res.status, await res.text());
