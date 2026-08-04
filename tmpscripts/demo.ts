import { forecastMonthEnd } from "../src/lib/dashboard/forecast";
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const org="00000000-0000-0000-0000-000000000001";
const now=new Date();
const since=new Date(now.getTime()-40*86400000).toISOString();
const { data: d } = await db.from("usage_rollups").select("bucket_start,model_key,host,task_hint,cost_usd").eq("org_id",org).eq("granularity","day").gte("bucket_start",since).limit(100000);
const { data: h } = await db.from("usage_rollups").select("bucket_start").eq("org_id",org).eq("granularity","hour").gte("bucket_start",since).limit(100000);
const m=new Map<string,Set<string>>();
for(const r of h??[]){const iso=String(r.bucket_start);const day=iso.slice(0,10);if(!m.has(day))m.set(day,new Set());m.get(day)!.add(iso.slice(11,13));}
const cov:Record<string,number>={}; for(const [k,v] of m) cov[k]=v.size;
const first=[...m.keys()].sort()[0];
const reliable=new Date(Date.parse(first+"T00:00:00Z")+86400000).toISOString().slice(0,10);
console.log("coverage:",cov,"reliableFrom:",reliable);
const f=forecastMonthEnd((d??[]).map(r=>({date:String(r.bucket_start).slice(0,10),key:`${r.model_key}|${r.host}|${r.task_hint}`,spend:Number(r.cost_usd)})),now,{hourCoverage:cov,coverageReliableFrom:reliable});
console.log({suppressed:f.suppressed,reason:f.suppressionReason,point:f.pointUsd,low:f.lowUsd,high:f.highUsd,observed:f.observedLevelDays,partial:f.partialLevelDates});
