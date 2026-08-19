import { supabaseAdmin } from "@/integrations/supabase/client.server";
const org="561efc9b-fbfb-479b-a2b7-c31a530e06fe";
const { data } = await supabaseAdmin.from("recommendations").select("id,kind,from_model_key,to_model_key,to_host,monthly_saving_usd,status,workload_key,created_at").eq("org_id",org);
console.log(data);
