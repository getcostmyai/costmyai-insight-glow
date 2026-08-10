import { buildDashboardSnapshot } from "../../src/lib/dashboard.server";
import { supabaseAdmin } from "../../src/integrations/supabase/client.server";
const orgId = process.argv[2]!;
const s: any = await buildDashboardSnapshot({ days: 30, objective: { objective: "cost" } as any, orgId, client: supabaseAdmin as never });
const sum = (a: any[], f: (x: any) => number) => Math.round(a.reduce((t, x) => t + f(x), 0) * 100) / 100;
const wl = (o: any) => `${o.fromModel}|${o.fromHost}|${o.taskHint}`;
// dedupe arbitrage+quality only, best per workload
const best = new Map<string, number>();
for (const r of [...s.hostArbitrage, ...s.qualityMatched]) best.set(wl(r), Math.max(best.get(wl(r)) ?? 0, r.saving));
console.log(JSON.stringify({
  plan: s.plan,
  totalsSpend: s.totals.spend,
  runRate30d: s.projection?.runRate30dUsd,
  arbitrage: { n: s.hostArbitrage.length, sum: sum(s.hostArbitrage, (r) => r.saving) },
  quality: { n: s.qualityMatched.length, sum: sum(s.qualityMatched, (r) => r.saving) },
  oversized: { n: s.oversized.length, sum: sum(s.oversized, (r) => r.wasted) },
  arbPlusQualityDeduped: Math.round([...best.values()].reduce((a, b) => a + b, 0) * 100) / 100,
  savings: s.savings,
  stats: s.stats,
  refusals: s.refusals,
  oversizedRows: s.oversized.map((o: any) => ({ model: o.model, host: o.host, hostKey: o.hostKey, toModel: o.toModel, exec: o.execution })),
}, null, 2));
