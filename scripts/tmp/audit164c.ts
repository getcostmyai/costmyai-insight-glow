import { buildDashboardSnapshot } from "../../src/lib/dashboard.server";
import { supabaseAdmin } from "../../src/integrations/supabase/client.server";
const s: any = await buildDashboardSnapshot({ days: 30, objective: { objective: "cost" } as any, orgId: "00000000-0000-0000-0000-000000000001", client: supabaseAdmin as never });
console.log(JSON.stringify({ govern: { running: s.govern.running, captured: s.govern.captured, eligible: s.govern.eligible.length, eligibleSaving: s.govern.eligibleSaving }, captured: s.savings.captured, available: s.savings.available, identified: Math.round((s.savings.captured+s.savings.available)*100)/100, reroutingCount: s.reroutingCount }, null, 2));
