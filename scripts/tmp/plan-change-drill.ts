import { createStripeClient } from "../../src/lib/stripe.server";
import { readCurrentSubscription, previewChange, applyChange, classifyChange } from "../../src/lib/billing/change.server";

const stripe = createStripeClient("sandbox");
const orgId = "00000000-0000-4000-8000-00000000dr11";
const userId = "00000000-0000-4000-8000-00000000dr22";

const price = async (key: string) => (await stripe.prices.list({ lookup_keys: [key], limit: 1 })).data[0]!;

const certify = await price("certify_monthly");
const govern = await price("govern_monthly");
console.log("prices", certify.id, certify.unit_amount, govern.id, govern.unit_amount);

const customer = await stripe.customers.create({ metadata: { orgId }, name: "Plan change drill" });
const pm = await stripe.paymentMethods.create({ type: "card", card: { token: "tok_visa" } } as any);
await stripe.paymentMethods.attach(pm.id, { customer: customer.id });
await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: pm.id } });

let sub = await stripe.subscriptions.create({
  customer: customer.id,
  items: [{ price: certify.id, quantity: 1 }],
  metadata: { orgId, userId, plan: "certify" },
});
console.log("created sub", sub.id, sub.status);

// --- upgrade: certify -> govern, immediate with proration
let current = await readCurrentSubscription(stripe, sub.id);
console.log("current", current.plan, current.interval, "periodEnd", current.periodEndIso);
console.log("classify upgrade =", classifyChange(current, { plan: "govern", interval: "monthly" }));
const quote = await previewChange(stripe, current, { plan: "govern", interval: "monthly" }, customer.id);
console.log("upgrade quote", JSON.stringify(quote));
const applied = await applyChange(stripe, current, { plan: "govern", interval: "monthly" }, { orgId, userId }, "sandbox");
console.log("applied", JSON.stringify(applied));

sub = await stripe.subscriptions.retrieve(sub.id);
console.log("after upgrade price =", sub.items.data[0]!.price.lookup_key, "meta.plan =", sub.metadata!["plan"]);
const items = await stripe.invoiceItems.list({ customer: customer.id, limit: 10 });
console.log("proration line items:", items.data.map(i => `${i.description} = ${i.amount}`));

// --- downgrade: govern -> certify, booked for the boundary
current = await readCurrentSubscription(stripe, sub.id);
console.log("classify downgrade =", classifyChange(current, { plan: "certify", interval: "monthly" }));
const down = await applyChange(stripe, current, { plan: "certify", interval: "monthly" }, { orgId, userId }, "sandbox");
console.log("downgrade applied", JSON.stringify(down));

sub = await stripe.subscriptions.retrieve(sub.id);
console.log("today still =", sub.items.data[0]!.price.lookup_key);
const schedId = typeof sub.schedule === "string" ? sub.schedule : sub.schedule?.id;
const sched = await stripe.subscriptionSchedules.retrieve(schedId!);
for (const p of sched.phases) {
  const pr = typeof p.items[0]!.price === "string" ? p.items[0]!.price : (p.items[0]!.price as any).id;
  const full = await stripe.prices.retrieve(pr);
  console.log("phase", new Date((p.start_date ?? 0)*1000).toISOString(), "->", p.end_date ? new Date(p.end_date*1000).toISOString() : "open", full.lookup_key);
}
const invAfterDown = await stripe.invoices.list({ customer: customer.id, limit: 5 });
console.log("invoices after downgrade:", invAfterDown.data.map(i => `${i.status} ${i.amount_due}`));

// --- cancelling the booked change
current = await readCurrentSubscription(stripe, sub.id);
const { cancelScheduledChange } = await import("../../src/lib/billing/change.server");
await cancelScheduledChange(stripe, current);
sub = await stripe.subscriptions.retrieve(sub.id);
console.log("after release, schedule =", sub.schedule ?? null, "price =", sub.items.data[0]!.price.lookup_key);

await stripe.subscriptions.cancel(sub.id);
console.log("cleanup done");
