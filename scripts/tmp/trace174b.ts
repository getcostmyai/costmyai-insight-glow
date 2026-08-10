import { createClient } from "@supabase/supabase-js";
import { forecastMonthEnd } from "../../src/lib/dashboard/forecast";
const db = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth:{persistSession:false}});
const ORG="00000000-0000-0000-0000-000000000001";
const { data } = await db.from("usage_rollups").select("bucket_start,model_key,host,task_hint,cost_usd").eq("org_id",ORG).eq("granularity","day").gte("bucket_start", new Date(Date.now()-60*86400000).toISOString()).limit(5000);
const rows=(data??[]).map((r:any)=>({date:r.bucket_start.slice(0,10),key:`${r.model_key}|${r.host}|${r.task_hint}`,spend:Number(r.cost_usd)}));
const f=forecastMonthEnd(rows,new Date());
console.log({newKeys:f.newKeys,retiredKeys:f.retiredKeys,suppressed:f.suppressed,isRange:f.isRange,point:f.pointUsd,low:f.lowUsd,high:f.highUsd,syncGapDates:f.syncGapDates,reasons:f.reasons});
