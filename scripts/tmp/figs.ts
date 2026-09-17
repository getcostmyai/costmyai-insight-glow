import { buildDashboardSnapshot } from "../../src/lib/dashboard.server";
import { supabaseAdmin } from "../../src/integrations/supabase/client.server";
const org = process.env.DEMO_ORG!;
const s = await buildDashboardSnapshot({ days: 30, objective: { objective: "cost" }, orgId: org, client: supabaseAdmin as never });
console.log({ spend: s.totals.spend, savings: s.savings, certify: s.certifySavings, govern: { eligibleSaving: s.govern.eligibleSaving, eligibleMonthly: s.govern.eligibleMonthly, count: s.govern.eligible.length } });
