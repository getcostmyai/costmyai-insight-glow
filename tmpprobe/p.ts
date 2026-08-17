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

// restricted-candidate probes
const only = (keys:string[]) => (g.prices as any[]).filter(p=>keys.includes(p.model_key));
const u51 = (g.usage as any[]).filter(u=>u.model_key==="openai/gpt-5.1");
console.log("--- gpt-5.1 vs only itself+expensive opus4.5",
  JSON.stringify(findQualityMatches(u51, only(["openai/gpt-5.1","anthropic/claude-opus-4.5"]), bench, margins as any).refusals.map(r=>[r.reason,r.detail])));
const uLuna=(g.usage as any[]).filter(u=>u.model_key==="openai/gpt-5.6-luna");
console.log("--- luna vs oss-120b only", JSON.stringify(findQualityMatches(uLuna, only(["openai/gpt-5.6-luna","openai/gpt-oss-120b"]), bench, margins as any).refusals.map(r=>[r.reason,r.detail])));
const tiny = u51.map(u=>({...u, requests:1, input_tokens:1000, output_tokens:200, cost_usd:0.01}));
console.log("--- tiny", JSON.stringify(findQualityMatches(tiny, g.prices as any, bench, margins as any).refusals.map(r=>r.reason)));
