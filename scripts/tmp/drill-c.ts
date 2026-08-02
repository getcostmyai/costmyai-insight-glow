import { supabaseAdmin } from "../../src/integrations/supabase/client.server";
const P = "11111111-2222-4333-8444-555555555001";
const led = async (t: string) => {
  const { data } = await supabaseAdmin.from("commission_ledger")
    .select("invoice_id, commission_usd, status, paid_at, stripe_transfer_id, clawback_of").order("created_at");
  console.log(`\n## ${t}`); console.table(data);
};
const begin = async () => (await supabaseAdmin.rpc("payout_begin", { _partner_id: P, _environment: "sandbox", _actor: null as any })).data;

const b1 = await begin(); console.log("\n[begin]", JSON.stringify(b1));
console.log("[settle]", JSON.stringify(await supabaseAdmin.rpc("payout_settle", { _payout_id: (b1 as any).payout_id, _transfer_id: "tr_DRILL_SIMULATED_NOT_A_REAL_TRANSFER" })));
await led("AFTER SETTLE");

console.log("[clawback]", JSON.stringify((await supabaseAdmin.rpc("clawback_commission", { _invoice_id: "in_sandbox_drill_001", _reason: "drill: refunded after payout", _environment: "sandbox" })).data));
await led("AFTER CLAWBACK OF A PAID LINE");
console.log("[begin again]", JSON.stringify(await begin()));
