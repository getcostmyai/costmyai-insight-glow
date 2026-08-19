import { supabaseAdmin } from "@/integrations/supabase/client.server";
const since = new Date(Date.now()-45*60*1000).toISOString();
const { data } = await supabaseAdmin.from("lead_events").select("event_type,visitor_id,referred_by_partner_id,created_at").gte("created_at", since).order("created_at");
console.log(JSON.stringify(data,null,1));
