import { createStripeClient } from "../../src/lib/stripe.server";
import { supabaseAdmin } from "../../src/integrations/supabase/client.server";
import { runPayoutForPartner, connectStatusFromAccount, readPayoutQueue } from "../../src/lib/partners/payouts.server";

const PARTNER = "11111111-2222-4333-8444-555555555001";
const ACTOR = "f7ee292a-a564-48d3-b131-512dbe3d88c4";
const stripe = createStripeClient("sandbox");

const acct = await stripe.accounts.create({
  type: "express",
  email: "drill-partner@costmyai.test",
  capabilities: { transfers: { requested: true } },
  metadata: { partnerId: PARTNER, drill: "payout-a" },
});
console.log("express account:", acct.id, "status:", connectStatusFromAccount(acct), "payouts_enabled:", acct.payouts_enabled);

const w = await supabaseAdmin.rpc("partner_set_connect_account", {
  _partner_id: PARTNER, _account_id: acct.id, _status: connectStatusFromAccount(acct), _environment: "sandbox",
});
console.log("db write err:", w.error);

console.log("queue:", JSON.stringify(await readPayoutQueue("sandbox"), null, 1));
console.log("run:", JSON.stringify(await runPayoutForPartner(PARTNER, "sandbox", ACTOR), null, 1));
