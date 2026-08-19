import { supabaseAdmin } from "@/integrations/supabase/client.server";
const since = new Date(Date.now()-6*60*1000).toISOString();
const { data } = await supabaseAdmin.from("lead_events").select("event_type,visitor_id,created_at").gte("created_at", since).order("created_at");
console.log(data?.map(d=>`${d.created_at} ${d.event_type} ${d.visitor_id}`).join("\n"));
