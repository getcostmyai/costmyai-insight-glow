import { supabaseAdmin } from "@/integrations/supabase/client.server";
const org="561efc9b-fbfb-479b-a2b7-c31a530e06fe";
const { data: ev, count } = await supabaseAdmin.from("usage_events").select("id,model_key,provider,cost_usd,created_at,workload",{count:"exact"}).eq("org_id",org).limit(3);
console.log("events:", count, ev);
const { data: r } = await supabaseAdmin.from("usage_rollups").select("*").eq("org_id",org).limit(3);
console.log("rollups:", r);
