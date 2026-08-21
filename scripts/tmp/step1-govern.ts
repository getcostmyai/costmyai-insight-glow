import { createClient } from "@supabase/supabase-js";
import { runPipeline } from "../../src/lib/engine/pipeline";
import { DEFAULT_AUTONOMOUS_POLICY, evaluateAutonomous } from "../../src/lib/engine/autonomous";
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {auth:{persistSession:false}});
const ORG="00000000-0000-0000-0000-000000000001";
async function all(t:string, q:(b:any)=>any){const out:any[]=[];for(let i=0;i<20;i++){const {data,error}=await q(db.from(t)).range(i*1000,i*1000+999);if(error)throw error;out.push(...(data??[]));if((data??[]).length<1000)break;}return out;}
const since=new Date(Date.now()-30*864e5).toISOString();
const rollups=await all("usage_rollups",(b)=>b.select("model_key,host,task_hint,requests,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,cost_usd,output_p50,output_p95").eq("org_id",ORG).eq("granularity","day").gte("bucket_start",since));
const prices=await all("host_prices",(b)=>b.select("model_key,host,host_label,input_usd_per_mtok,output_usd_per_mtok,cache_read_usd_per_mtok,cache_write_usd_per_mtok,supports_prompt_caching,median_latency_ms,median_ttft_ms,output_tps,latency_scope").eq("is_active",true));
const benchmarks=await all("benchmarks",(b)=>b.select("model_key,suite,task_class,score").eq("is_fixture",false));
const margins=await all("benchmark_margins",(b)=>b.select("suite,task_class,margin,method,synced_at,source_run_id").eq("is_fixture",false));
const models=await all("model_catalog",(b)=>b.select("model_key,display_name,vendor,tier").eq("is_active",true));
const num=(r:any,k:string)=>r[k]==null?null:Number(r[k]);
const P=prices.map((p)=>({...p,input_usd_per_mtok:+p.input_usd_per_mtok,output_usd_per_mtok:+p.output_usd_per_mtok,cache_read_usd_per_mtok:num(p,"cache_read_usd_per_mtok"),cache_write_usd_per_mtok:num(p,"cache_write_usd_per_mtok"),median_latency_ms:num(p,"median_latency_ms"),median_ttft_ms:num(p,"median_ttft_ms"),output_tps:num(p,"output_tps")}));
const map=new Map<string,any>();const shapes=new Map<string,{p50:number[];p95:number[]}>();
for(const r of rollups){const k=`${r.model_key}|${r.host}|${r.task_hint}`;const a=map.get(k)??{model_key:r.model_key,host:r.host,task_hint:r.task_hint,requests:0,input_tokens:0,output_tokens:0,cache_read_tokens:0,cache_write_tokens:0,cost_usd:0,days:30};a.requests+=+r.requests;a.input_tokens+=+r.input_tokens;a.output_tokens+=+r.output_tokens;a.cost_usd+=+r.cost_usd;map.set(k,a);const s=shapes.get(k)??{p50:[],p95:[]};if(r.output_p50)s.p50.push(+r.output_p50);if(r.output_p95)s.p95.push(+r.output_p95);shapes.set(k,s);}
const med=(v:number[])=>v.length?[...v].sort((a,b)=>a-b)[Math.floor(v.length/2)]:null;
const usage=[...map.entries()].map(([k,u])=>({...u,output_p50:med(shapes.get(k)!.p50),output_p95:med(shapes.get(k)!.p95)}));
const out=runPipeline({usage,prices:P as any,benchmarks:benchmarks.map(b=>({...b,score:+b.score})) as any,margins:margins.map(m=>({...m,margin:+m.margin})) as any,models:models as any,objectives:[],staleEvidence:null});
const pol={...DEFAULT_AUTONOMOUS_POLICY,enabled:true};
const cells:Record<string,number>={};
const rows:any[]=[];
for(const [kind,recs] of [["host_arbitrage",out.hostArbitrage],["quality_match",out.qualityMatched],["rightsize",out.oversized]] as any){
 for(const r of recs){const v=evaluateAutonomous(r,pol,{now:new Date()});const key=`${kind}:${v.allowed?"allowed":v.reason}`;cells[key]=(cells[key]??0)+1;
  rows.push({kind,from:`${r.fromModel}@${r.fromHost}`,to:`${r.toModel}@${r.toHost}`,save:r.monthlySavingUsd,qd:r.qualityDelta,margin:r.marginUsed,verdict:v.allowed?"allowed":v.reason});}}
console.log("usage workloads",usage.length,"stats",out.stats);
console.log(cells);
console.table(rows);
console.log("refusal reasons sample", out.refusals.slice(0,8));
