import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const ORG = "5e7ad1de-a195-4bcb-a579-d60de6c2c0ed";
const sub = process.argv[2]!, plan = process.argv[3]!;
await sb.from("subscriptions").update({ created_at: new Date().toISOString() }).eq("stripe_subscription_id", sub);
const r = await sb.from("organizations").update({ plan, stripe_subscription_id: sub }).eq("id", ORG).select("plan,plan_valid_until,stripe_subscription_id");
const s = await sb.from("subscriptions").select("plan,status,current_period_end,cancel_at_period_end").eq("stripe_subscription_id", sub).single();
console.log(JSON.stringify({ org: r.data, sub: s.data }));
