import { supabaseAdmin } from "@/integrations/supabase/client.server";
const { data, error } = await supabaseAdmin.from("lead_events").select("event_type,visitor_id,referred_by_partner_id,created_at")
  .in("event_type",["estimator_viewed","estimator_engaged","estimator_completed"]).order("created_at",{ascending:false}).limit(8);
console.log(error ?? data);
