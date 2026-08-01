import { it } from "vitest";
import { buildDashboardSnapshot } from "@/lib/dashboard.server";
it("dbg", async () => {
  const s = await buildDashboardSnapshot({ days: 30 });
  console.log(JSON.stringify(s.savings, null, 1));
  console.log("govern", s.govern.eligibleSaving, s.govern.eligible.length, s.govern.refusals.length);
  const keys = s.govern.eligible.map(e=>`${e.fromModel}|${e.fromHost}|${e.taskHint}`);
  console.log("uniq", new Set(keys).size, keys.length);
  console.log("byKind", s.govern.eligible.reduce((a:any,e)=>{a[e.kind]=(a[e.kind]||0)+e.saving;return a;},{}));
}, 60000);
