import { syncArtificialAnalysis } from "../src/lib/benchmarks/aa-sync.server";
import { buildDashboardSnapshot } from "../src/lib/dashboard.server";

const r = await syncArtificialAnalysis();
console.log("fetched", r.fetchedModels, "matched", r.matchedModels.length, "latencies", r.latenciesWritten, "host rows updated", r.hostRowsWithLatency);

for (const o of ["cost", "latency"] as const) {
  const sel = o === "cost" ? { objective: o } : { objective: o, maxLatencyMs: 1200 };
  const s = await buildDashboardSnapshot({ days: 30, objective: sel as never });
  console.log(o.padEnd(8), "matched:", s.qualityMatched.length, "refusals:", s.refusals, "avail:", s.savings.availableMonthly);
  if (o === "latency") s.qualityMatched.slice(0, 3).forEach(q => console.log("   ->", q.toModel, "|", q.note));
}
