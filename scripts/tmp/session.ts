import { createStripeClient } from "../../src/lib/stripe.server";
import { createClient } from "@supabase/supabase-js";

const stripe = createStripeClient("sandbox");
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Tax codes: SaaS / electronic services for all three rungs.
for (const id of ["certify", "rightsize", "govern"]) {
  const found = await stripe.products.search({ query: `metadata['lovable_external_id']:'${id}'`, limit: 1 });
  if (found.data[0]) {
    await stripe.products.update(found.data[0].id, { tax_code: "txcd_10103001" });
    console.log("tax_code set:", id, found.data[0].id);
  } else console.log("product not found by external id:", id);
}

const slug = `e2e-checkout-${Date.now()}`;
const { data: org, error } = await db
  .from("organizations")
  .insert({ name: "E2E Checkout Test", slug, plan: "compare", is_synthetic: false })
  .select("id, plan")
  .single();
if (error) throw error;
console.log("org:", org);

const prices = await stripe.prices.list({ lookup_keys: ["certify_monthly"] });
const price = prices.data[0]!;
const customer = await stripe.customers.create({ email: "e2e-test@costmyai.dev", metadata: { userId: "f7ee292a-a564-48d3-b131-512dbe3d88c4" } });

const session = await stripe.checkout.sessions.create({
  line_items: [{ price: price.id, quantity: 1 }],
  mode: "subscription",
  ui_mode: "hosted_page",
  success_url: "https://example.com/done?s={CHECKOUT_SESSION_ID}",
  customer: customer.id,
  managed_payments: { enabled: true },
  metadata: { userId: "f7ee292a-a564-48d3-b131-512dbe3d88c4", orgId: org.id, plan: "certify", managed_payments: "true" },
  subscription_data: { metadata: { userId: "f7ee292a-a564-48d3-b131-512dbe3d88c4", orgId: org.id, plan: "certify" } },
} as any);
console.log("ORG_ID=" + org.id);
console.log("URL=" + session.url);
