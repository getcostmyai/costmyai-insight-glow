import { supabaseAdmin } from "@/integrations/supabase/client.server";
const v = process.argv[2];
const { data } = await supabaseAdmin.from("lead_events").select("id,event_type,referred_by_partner_id,created_at").eq("visitor_id", v).order("created_at");
console.log(data?.map(d=>`${d.created_at} ${d.event_type} partner=${d.referred_by_partner_id}`).join("\n"));
