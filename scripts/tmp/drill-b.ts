import { supabaseAdmin } from "../../src/integrations/supabase/client.server";
import { runPayoutForPartner, readPayoutQueue } from "../../src/lib/partners/payouts.server";

const P = "11111111-2222-4333-8444-555555555001";
const ACTOR = "f7ee292a-a564-48d3-b131-512dbe3d88c4";
const led = async (t: string) => {
  const { data } = await supabaseAdmin.from("commission_ledger")
    .select("invoice_id, commission_usd, status, payout_id, paid_at, stripe_transfer_id")
    .order("created_at");
  console.log(`\n## ${t}`); console.table(data);
};
const setConnect = (status: string, acct: string | null) =>
  supabaseAdmin.rpc("partner_set_connect_account", { _partner_id: P, _account_id: acct as any, _status: status, _environment: "sandbox" });

await led("BEFORE");

// 1. not-yet-verified partner
await setConnect("pending", "acct_drill_pending");
console.log("\n[1] queue:", JSON.stringify(await readPayoutQueue("sandbox")));
console.log("[1] run:", JSON.stringify(await runPayoutForPartner(P, "sandbox", ACTOR)));
await led("AFTER SKIP (must be untouched)");

// 2. verified partner, transfer rejected by provider -> lines released
await setConnect("active", "acct_drill_active");
console.log("\n[2] run:", JSON.stringify(await runPayoutForPartner(P, "sandbox", ACTOR)));
await led("AFTER FAILED TRANSFER (lines released)");
console.table((await supabaseAdmin.from("partner_payouts").select("id,status,amount_usd,line_count,error")).data);
