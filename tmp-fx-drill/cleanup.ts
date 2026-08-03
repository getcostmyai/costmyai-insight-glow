import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env["STRIPE_LIVE_TEST_API_KEY"]!, {
  apiVersion: "2026-03-25.dahlia",
});
const db = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
  auth: { persistSession: false },
});

const ACCOUNTS = ["acct_1U0GbAIepwSCyKkx", "acct_1U0GbfElGxsDhGfR", "acct_1U0Gb8I4Mw05AiXi"];
const CHARGES = [
  "ch_3U0GawIbhvmHvgMk1ii8v4vx",
  "ch_3U0Gb6IbhvmHvgMk2IpUfGSx",
  "ch_3U0GbQIbhvmHvgMk2duXIGfs",
  "ch_3U0GbZIbhvmHvgMk2HFYTlS6",
];

for (const id of ACCOUNTS) {
  try {
    await stripe.accounts.del(id);
    console.log("deleted account", id);
  } catch (e: any) {
    console.log("account", id, e?.raw?.message ?? e?.message);
  }
}
for (const id of CHARGES) {
  try {
    const r = await stripe.refunds.create({ charge: id });
    console.log("refunded", id, r.id);
  } catch (e: any) {
    console.log("charge", id, e?.raw?.message ?? e?.message);
  }
}
// Test-mode customers/invoices left behind carry no money and are harmless,
// but remove them anyway.
const customers = await stripe.customers.list({ limit: 100 });
for (const c of customers.data) {
  if (c.email?.startsWith("fx-drill-")) {
    await stripe.customers.del(c.id);
    console.log("deleted customer", c.id);
  }
}

const { data: partners } = await db.from("partners").select("id, name").like("name", "FX Drill%");
const ids = (partners ?? []).map((p) => p.id);
console.log("drill partners:", ids);
if (ids.length) {
  console.log(await db.from("commission_ledger").delete().in("partner_id", ids).select("id"));
  console.log(await db.from("partner_payouts").delete().in("partner_id", ids).select("id"));
  console.log(
    await db.from("organizations").delete().in("referred_by_partner_id", ids).select("id"),
  );
  console.log(await db.from("partners").delete().in("id", ids).select("id"));
}
console.log("remaining drill rows:", (await db.from("partners").select("id").like("name", "FX Drill%")).data);
