import { supabaseAdmin } from "@/integrations/supabase/client.server";
const code = "CHAINDRILL";
const { data: existing } = await supabaseAdmin.from("partners").select("id, referral_code, status").ilike("referral_code", code).maybeSingle();
if (existing) { console.log("EXISTING", existing); process.exit(0); }
const { data, error } = await supabaseAdmin.from("partners").insert({
  name: "Chain Drill Partner",
  contact_email: "chain-drill@costmyai.invalid",
  referral_code: code,
  status: "active",
}).select("id, referral_code, status").single();
console.log(error ?? data);
