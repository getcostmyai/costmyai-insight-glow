import { supabaseAdmin } from "@/integrations/supabase/client.server";
const { data } = await supabaseAdmin.from("lead_events").select("payload,created_at")
 .eq("event_type","page_viewed").order("created_at",{ascending:false}).limit(3);
console.log(JSON.stringify(data,null,1));
