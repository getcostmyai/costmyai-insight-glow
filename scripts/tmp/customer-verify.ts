import { createStripeClient } from "../../src/lib/stripe.server";
import { resolveOrgCustomer } from "../../src/lib/billing/customer.server";
const stripe = createStripeClient("sandbox");
const ORG = "5e7ad1de-a195-4bcb-a579-d60de6c2c0ed";
const recent = await stripe.customers.list({ limit: 10 });
console.log("10 most recent sandbox customers:");
for (const c of recent.data) console.log(" ", c.id, c.created, JSON.stringify(c.metadata));
const [a,b,c] = await Promise.all([
  resolveOrgCustomer(stripe, "sandbox", ORG, { userId: "00000000-0000-0000-0000-000000000009" }),
  resolveOrgCustomer(stripe, "sandbox", ORG, { userId: "00000000-0000-0000-0000-000000000009" }),
  resolveOrgCustomer(stripe, "sandbox", ORG, { userId: "00000000-0000-0000-0000-000000000009" }),
]);
console.log("pinned reuse:", a, b, c, "all same:", a===b && b===c);
