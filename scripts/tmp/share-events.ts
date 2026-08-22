import { supabaseAdmin } from "@/integrations/supabase/client.server";
const since = new Date(Date.now()-15*60*1000).toISOString();
const { data } = await supabaseAdmin.from("lead_events").select("event_type,visitor_id,session_id,payload,created_at").eq("event_type","intelligence_card_shared").gte("created_at",since).order("created_at");
console.log(JSON.stringify(data,null,1));
