import { supabaseAdmin } from "@/integrations/supabase/client.server";
const { data, error } = await supabaseAdmin.from("lead_events")
 .select("event_type,visitor_id,session_id,payload,created_at")
 .eq("visitor_id","2b4b3906-a73b-4297-947f-babee2fbeaa4")
 .order("created_at");
console.log(error ?? data);
