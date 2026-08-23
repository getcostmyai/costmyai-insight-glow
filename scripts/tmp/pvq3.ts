import { supabaseAdmin } from "@/integrations/supabase/client.server";
const { data } = await supabaseAdmin.from("lead_events").select("visitor_id,payload,created_at")
 .eq("event_type","page_viewed").order("created_at",{ascending:false}).limit(5);
for (const r of data ?? []) console.log(r.created_at, r.visitor_id, (r.payload as any).path);
