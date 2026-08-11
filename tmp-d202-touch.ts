import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const r = await sb.from("subscriptions").update({ created_at: new Date().toISOString() }).eq("stripe_subscription_id", process.argv[2]!).select("plan,status,current_period_end,stripe_subscription_id");
console.log(JSON.stringify(r.error ?? r.data));
