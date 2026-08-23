import { supabaseAdmin } from "@/integrations/supabase/client.server";
const { data, error } = await supabaseAdmin.from("lead_events")
 .select("event_type,visitor_id,session_id,payload,created_at")
 .eq("visitor_id","2252a571-c3ed-4960-bdef-f48e8e5c2deb")
 .order("created_at");
console.log(error ?? data);
