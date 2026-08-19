import { createStripeClient } from "@/lib/stripe.server";
const s = createStripeClient("sandbox");
const list = await s.charges.list({ limit: 10 });
for (const c of list.data) {
  const bt = typeof c.balance_transaction === "string" ? await s.balanceTransactions.retrieve(c.balance_transaction) : null;
  console.log({ charge: c.id, chargeCur: c.currency, btCur: bt?.currency, rate: bt?.exchange_rate, amount: bt?.amount });
}
const bal = await s.balance.retrieve();
console.log("platform balance currencies:", bal.available.map(a => a.currency));
