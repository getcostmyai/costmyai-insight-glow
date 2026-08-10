import { gateLevel } from "../../src/lib/dashboard/plan";
import { aggregateSavings } from "../../src/lib/dashboard/savings";
import { buildDashboardSnapshot } from "../../src/lib/dashboard.server";
import { supabaseAdmin } from "../../src/integrations/supabase/client.server";
const s: any = await buildDashboardSnapshot({ days: 30, objective: { objective: "cost" } as any, orgId: "00000000-0000-0000-0000-000000000001", client: supabaseAdmin as never });
const wl = (o: any) => `${o.fromModel}|${o.fromHost}|${o.taskHint}`;
for (const plan of ["compare", "certify", "rightsize", "govern"] as const) {
  const a = gateLevel("host_arbitrage", plan, s.hostArbitrage, (r: any) => r.saving);
  const q = gateLevel("quality_match", plan, s.qualityMatched, (r: any) => r.saving);
  const o = gateLevel("rightsize", plan, s.oversized, (r: any) => r.wasted);
  const tot = aggregateSavings([
    ...s.hostArbitrage.map((r: any) => ({ key: wl(r), saving: r.saving, unlocked: a.unlocked })),
    ...s.qualityMatched.map((r: any) => ({ key: wl(r), saving: r.saving, unlocked: q.unlocked })),
    ...s.oversized.map((r: any) => ({ key: `${r.model}|${r.hostKey}|${r.task}`, saving: r.wasted, unlocked: o.unlocked })),
  ]);
  console.log(plan, JSON.stringify({
    rowsVisible: { arb: a.items.length, qual: q.items.length, over: o.items.length },
    teaser: { qualLockedCount: q.lockedCount, qualLockedSaving: Math.round(q.lockedSaving*100)/100, overLockedCount: o.lockedCount, overLockedSaving: Math.round(o.lockedSaving*100)/100 },
    available: tot.available, locked: tot.locked,
  }));
}
