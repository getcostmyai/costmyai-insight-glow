import g from "../src/lib/benchmarks/__tests__/golden/certification-2026-08-17.json";
import { findQualityMatches, buildScoreLookup } from "../src/lib/engine/equivalence";
const bench:any[] = [...g.scores];
for (const [f, i] of Object.entries<any>(g.instruments)) {
  bench.push({model_key:"__spread_min__",suite:i.suite,task_class:f,score:i.min_score});
  bench.push({model_key:"__spread_max__",suite:i.suite,task_class:f,score:i.max_score});
}
const margins = Object.entries<any>(g.instruments).map(([f,i])=>({suite:i.suite,task_class:f,margin:i.margin}));
const l = buildScoreLookup(bench, margins as any);
for (const f of Object.keys(g.instruments)) console.log(f, l.separation(f as any));
const r = findQualityMatches(g.usage as any, g.prices as any, bench, margins as any);
for (const rec of r.recommendations) console.log("CERTIFY", rec.fromModel, rec.fromHost, rec.taskHint, "->", rec.toModel, rec.toHost, rec.monthlySavingUsd, rec.qualityDelta, rec.marginUsed);
for (const f of r.refusals) console.log("REFUSE", f.fromModel, f.taskHint, f.reason, "|", f.detail.slice(0,110));
