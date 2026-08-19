import { supabaseAdmin } from "@/integrations/supabase/client.server";
const { data } = await supabaseAdmin.from("lead_events").select("id,event_type,visitor_id,referred_by_partner_id,created_at,payload").order("created_at",{ascending:false}).limit(10);
console.log(data);
