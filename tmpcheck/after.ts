import { buildDashboardSnapshot } from "../src/lib/dashboard.server";
import { gateRung } from "../src/lib/dashboard/plan";
import type { PlanTier } from "../src/lib/engine/types";

const run = async () => {
  for (const d of [30, 7, 1] as const) {
    const s = await buildDashboardSnapshot(d);
    console.log(`\n== ${d}d ==  state=${s.dataState} plan=${s.plan} objective=${s.objective.objective}`);
    console.log("spend", s.totals.spend);
    console.log("arbitrage", s.hostArbitrage.length, "quality", s.qualityMatched.length, "oversized", s.oversized.length);
    console.log("switches", s.activeSwitches.map(x => `${x.toModel}@${x.since}`).join(" | ") || "-", `(+${s.switchesOutsideWindow} outside)`);
    console.log("recon", s.reconciliation.map(r => `${r.provider} ${r.periodStart}->${r.periodEnd}`).join(" | ") || "-", `(+${s.reconciliationOutsideWindow} outside)`);
  }

  console.log("\n== objective, 30d ==");
  for (const o of ["cost", "latency", "quality_floor"] as const) {
    const sel = o === "cost" ? { objective: o } : o === "latency" ? { objective: o, maxLatencyMs: 1200 } : { objective: o, qualityFloorScore: 70 };
    const s = await buildDashboardSnapshot({ days: 30, objective: sel as never });
    console.log(o.padEnd(14), "quality-matched:", s.qualityMatched.length, "refusals:", s.refusals, "avail:", s.savings.availableMonthly);
  }

  console.log("\n== plan gating over the same real 30d findings ==");
  const s = await buildDashboardSnapshot(30);
  const items = { host_arbitrage: s.hostArbitrage.map(r => r.monthlySaving), quality_match: s.qualityMatched.map(r => r.monthlySaving), rightsize: s.oversized.map(o => o.wasted) };
  for (const plan of ["compare", "certify", "rightsize", "govern"] as PlanTier[]) {
    const parts = (Object.keys(items) as (keyof typeof items)[]).map(k => {
      const g = gateRung(k, plan, items[k].map(v => ({ v })), (x) => x.v);
      return `${k}:${g.unlocked ? `${g.items.length} rows` : `LOCKED ${g.lockedCount}/$${g.lockedMonthly.toFixed(0)}`}`;
    });
    console.log(plan.padEnd(10), parts.join("  "));
  }
};
run();
