import { supabaseAdmin } from "@/integrations/supabase/client.server";
const { data: org } = await supabaseAdmin.from("organizations").select("id,name,plan,referred_by_partner_id,referred_at,first_visitor_id,created_by,created_at").order("created_at",{ascending:false}).limit(2);
console.log(org);
const { data: ev } = await supabaseAdmin.from("lead_events").select("event_type,visitor_id,referred_by_partner_id,payload,created_at").eq("visitor_id","0f7bc453-24c2-445c-af1c-163f0e2ffaec").order("created_at");
console.log(ev?.map(e=>`${e.created_at} ${e.event_type} p=${e.referred_by_partner_id}`).join("\n"));
