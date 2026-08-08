import { buildDashboardSnapshot } from "../../src/lib/dashboard.server";
import { createClient } from "@supabase/supabase-js";
const c = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {auth:{persistSession:false}});
try {
  const s = await buildDashboardSnapshot({ days: 30, objective: { objective: "cost" } as never, orgId: "00000000-0000-0000-0000-000000000002", client: c as never });
  console.log("ok", JSON.stringify(s).slice(0,200));
} catch (e) { console.error("ERR", e); }
