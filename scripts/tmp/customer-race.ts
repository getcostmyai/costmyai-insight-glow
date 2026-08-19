import { createStripeClient } from "../../src/lib/stripe.server";
import { resolveOrgCustomer } from "../../src/lib/billing/customer.server";
import { supabaseAdmin } from "../../src/integrations/supabase/client.server";

const ORG = "5e7ad1de-a195-4bcb-a579-d60de6c2c0ed";
const stripe = createStripeClient("sandbox");

const before = await supabaseAdmin.from("org_stripe_customers").select("*").eq("org_id", ORG);
console.log("pinned before:", before.data);

// Force the exact race from a cold start: unpin, then two simultaneous resolves.
await supabaseAdmin.from("org_stripe_customers").delete().eq("org_id", ORG).eq("environment", "sandbox");

const [a, b] = await Promise.all([
  resolveOrgCustomer(stripe, "sandbox", ORG, { userId: "00000000-0000-0000-0000-000000000009", email: "race@example.com" }),
  resolveOrgCustomer(stripe, "sandbox", ORG, { userId: "00000000-0000-0000-0000-000000000009", email: "race@example.com" }),
]);
console.log("race result:", a, b, "same:", a === b);

const after = await supabaseAdmin.from("org_stripe_customers").select("*").eq("org_id", ORG);
console.log("pinned after:", after.data);

const list = await stripe.customers.search({ query: `metadata['orgId']:'${ORG}'`, limit: 20 });
console.log("stripe customers for org (search index):", list.data.map(c => `${c.id}${(c as any).deleted ? " (deleted)" : ""}`));

// restore the pin to the customer holding the real subscription history
await supabaseAdmin.from("org_stripe_customers").upsert(
  { org_id: ORG, environment: "sandbox", stripe_customer_id: "cus_UzHd3gFaHbNjNx" },
  { onConflict: "org_id,environment" },
);
console.log("restored pin");
