import { createClient } from "@supabase/supabase-js";
import { runPipeline } from "../../src/lib/engine/pipeline";
import { aggregateSavings } from "../../src/lib/dashboard/savings";

const db = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } });
const ORG = "00000000-0000-0000-0000-000000000001";
const days = 30;
const since = new Date(Date.now() - days * 86400000).toISOString();

const [rollups, prices, benchmarks, margins, models] = await Promise.all([
  db.from("usage_rollups").select("model_key,host,task_hint,requests,input_tokens,output_tokens,cost_usd,output_p50,output_p95").eq("org_id", ORG).eq("granularity","day").gte("bucket_start", since),
  db.from("host_prices").select("model_key,host,host_label,input_usd_per_mtok,output_usd_per_mtok,median_latency_ms").eq("is_active", true),
  db.from("benchmarks").select("model_key,suite,task_class,score").eq("is_fixture", false),
  db.from("benchmark_margins").select("suite,task_class,margin,method,synced_at,source_run_id").eq("is_fixture", false),
  db.from("model_catalog").select("model_key,display_name,vendor,tier").eq("is_active", true),
]);
const byW = new Map<string, any>();
for (const r of rollups.data ?? []) {
  const k = `${r.model_key}|${r.host}|${r.task_hint}`;
  const e = byW.get(k) ?? { model_key: r.model_key, host: r.host, task_hint: r.task_hint, requests:0,input_tokens:0,output_tokens:0,cost_usd:0, days };
  e.requests += Number(r.requests); e.input_tokens += Number(r.input_tokens); e.output_tokens += Number(r.output_tokens); e.cost_usd += Number(r.cost_usd);
  byW.set(k, e);
}
const usage = [...byW.values()];
const result = runPipeline({
  usage,
  prices: (prices.data??[]).map((p:any)=>({...p,input_usd_per_mtok:+p.input_usd_per_mtok,output_usd_per_mtok:+p.output_usd_per_mtok,median_latency_ms:p.median_latency_ms==null?null:+p.median_latency_ms})),
  benchmarks: (benchmarks.data??[]).map((b:any)=>({...b,score:+b.score})),
  margins: (margins.data??[]).map((m:any)=>({...m,margin:+m.margin})),
  models: (models.data??[]) as any,
});
const wl = (o:any)=>`${o.fromModel}|${o.fromHost}|${o.taskHint}`;
const A = result.hostArbitrage.map((r:any)=>({key:wl(r),saving:r.savingUsd,unlocked:true}));
const Q = result.qualityMatched.map((r:any)=>({key:wl(r),saving:r.savingUsd,unlocked:true}));
const R = result.oversized.map((r:any)=>({key:wl(r),saving:r.savingUsd,unlocked:true}));
const two = aggregateSavings([...A,...Q]);
const three = aggregateSavings([...A,...Q,...R]);
console.log("spend", usage.reduce((s,u)=>s+u.cost_usd,0).toFixed(2));
console.log("arbitrage sum", A.reduce((s,x)=>s+x.saving,0).toFixed(2), "n", A.length);
console.log("benchmark sum", Q.reduce((s,x)=>s+x.saving,0).toFixed(2), "n", Q.length);
console.log("rightsize sum", R.reduce((s,x)=>s+x.saving,0).toFixed(2), "n", R.length);
console.log("TWO-WAY", two);
console.log("THREE-WAY", three);
const setA=new Set(A.map(x=>x.key)), setQ=new Set(Q.map(x=>x.key)), setR=new Set(R.map(x=>x.key));
const twoOverlap=[...setA].filter(k=>setQ.has(k));
const counts=new Map<string,number>();
for(const k of [...setA,...setQ,...setR]) counts.set(k,(counts.get(k)??0)+1);
const threeOverlap=[...counts].filter(([,n])=>n>1).map(([k])=>k);
console.log("two-way overlap keys", twoOverlap.length, twoOverlap);
console.log("three-way overlap keys", threeOverlap.length, threeOverlap);
console.log("identical sets?", twoOverlap.length===threeOverlap.length && twoOverlap.every(k=>threeOverlap.includes(k)));
