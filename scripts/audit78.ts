import { buildDashboardSnapshot } from "@/lib/dashboard.server";
import { DEMO_ORG_ID } from "@/lib/supabase-public.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const s: any = await buildDashboardSnapshot({ days: 30, objective: { objective: "cost" }, orgId: DEMO_ORG_ID, client: supabaseAdmin as never });
const arbitrage = s.hostArbitrage.reduce((a: number, r: any) => a + r.saving, 0);
const benchmark = s.levels.quality_match.unlocked ? s.qualityMatched.reduce((a: number, r: any) => a + r.saving, 0) : s.levels.quality_match.lockedSaving;
const rightsize = s.levels.rightsize.unlocked ? s.oversized.reduce((a: number, r: any) => a + r.wasted, 0) : s.levels.rightsize.lockedSaving;
console.log(JSON.stringify({
  savings: s.savings,
  arbitrage, benchmark, rightsize,
  counts: { arb: s.hostArbitrage.length, qual: s.qualityMatched.length, over: s.oversized.length,
    certifiedCount: s.savings.certifiedCount, activeInWindow: s.activeSwitches.length, outside: s.switchesOutsideWindow, frozen: s.frozen },
  refusalsCertify: s.refusals, nonQualifying: s.nonQualifying?.length,
  governRefusals: s.govern.refusals.length, governEligible: s.govern.eligible.length, governRunning: s.govern.running, governCaptured: s.govern.captured,
  composition: s.composition,
  spend: s.totals.spend,
  governRefusalKinds: s.govern.refusals.map((r: any) => r.kind),
}, null, 2));
