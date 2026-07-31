import { buildDashboardSnapshot } from "../src/lib/dashboard.server";
const run = async () => {
  for (const d of [30, 7, 1] as const) {
    const s = await buildDashboardSnapshot(d);
    console.log(`\n== ${d}d ==`);
    console.log("spend", s.totals.spend);
    console.log("arbitrage", s.hostArbitrage.length, "quality", s.qualityMatched.length, "oversized", s.oversized.length);
    console.log("switches", s.activeSwitches.map(x => `${x.toModel}@${x.since}`).join(" | ") || "-");
    console.log("recon", s.reconciliation.map(r => `${r.provider} ${r.periodStart}->${r.periodEnd}`).join(" | ") || "-");
  }
};
run();
