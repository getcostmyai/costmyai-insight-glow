import { supabaseAdmin } from "@/integrations/supabase/client.server";
const org="561efc9b-fbfb-479b-a2b7-c31a530e06fe";
const { data } = await supabaseAdmin.from("usage_rollups").select("model_key,granularity,requests,cost_usd").eq("org_id",org).eq("granularity","day");
console.log(data);
const mod = await import("@/lib/engine/recommend");
console.log(Object.keys(mod));
