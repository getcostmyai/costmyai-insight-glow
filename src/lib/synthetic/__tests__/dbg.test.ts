import { describe, it } from "vitest";
import { DAY_MS, generateEvents, rollupEvents, percentile } from "@/lib/synthetic/generator";
import { aggregateRollups } from "@/lib/synthetic/profiles";
import { sizeWorkloads } from "@/lib/synthetic/sizing";
import { SYNTHETIC_WORKLOADS } from "@/lib/synthetic/workloads";
import { shapeOf, requiredTierFor } from "@/lib/engine/rightsize";
const price=(m:string,h:string,i:number,o:number)=>({model_key:m,host:h,host_label:h,input_usd_per_mtok:i,output_usd_per_mtok:o});
const P=[price("o1-pro","api.openai.com",150,600),price("gpt-5.5","api.openai.com",2.5,10),price("gpt-5.4","api.openai.com",2,8),price("gpt-4","api.openai.com",30,60),price("claude-opus-4-5","api.anthropic.com",15,75),price("claude-opus-4-7","api.anthropic.com",15,75),price("claude-opus-4-7-fast","api.anthropic.com",8,40),price("qwen3-coder-next","dashscope.aliyuncs.com",0.9,3.6),price("gpt-oss-120b","api.deepinfra.com",0.15,0.6),price("deepseek-v4-flash","api.venice.ai",0.28,1.12),price("qwen3-32b","api.groq.com",0.29,0.59),price("gpt-5-6-terra","openai",1,4),price("gpt-5-6-luna","openai",0.2,0.8)];
const pf=(m:string,h:string)=>P.find(p=>p.model_key===m&&p.host===h);
describe("dbg",()=>{it("x",()=>{
const TO=new Date("2026-07-31T00:00:00.000Z"), FROM=new Date(TO.getTime()-30*DAY_MS);
const S=sizeWorkloads(SYNTHETIC_WORKLOADS,pf,{windowDays:30,targetMonthlyUsd:1000});
const ev=S.flatMap(w=>generateEvents({workload:w,from:FROM,to:TO,seed:"test"}));
const daily=rollupEvents(ev,"day",pf);
const agg=aggregateRollups(daily,30);
for(const u of agg) console.log(u.model_key, u.requests, "p50",u.output_p50,"p95",u.output_p95, JSON.stringify(shapeOf(u)), requiredTierFor(u));
})});
