import { createClient } from "@supabase/supabase-js";
import { mintApiKey } from "../../src/lib/ingest/keys.server";
const URL=process.env["SUPABASE_URL"]!,S=process.env["SUPABASE_SERVICE_ROLE_KEY"]!,P=process.env["SUPABASE_PUBLISHABLE_KEY"]!;
const admin=createClient(URL,S,{auth:{persistSession:false}});
const stamp=Date.now(), email=`d95-${stamp}@costmyai-test.dev`, password="Dispatch-95-Proof!";
const u=await admin.auth.admin.createUser({email,password,email_confirm:true}); if(u.error) throw u.error;
const c=createClient(URL,P,{auth:{persistSession:false}}); await c.auth.signInWithPassword({email,password});
const org=(await c.rpc("create_organization",{_name:`Dispatch 95 ${stamp}`})).data as string;
const k=await mintApiKey(org,"d95",u.data.user!.id);
const now=Date.now();
const batch=(model:string,tag:string,n:number)=>Array.from({length:n},(_,i)=>({occurred_at:new Date(now-i*1_800_000).toISOString(),model_key:model,host:"openai",task_hint:"generation" as const,input_tokens:3000,output_tokens:800,latency_ms:900,status:"ok" as const,idempotency_key:`${tag}-${stamp}-${i}`}));
async function push(model:string,tag:string,n:number){
  const r=await fetch("http://localhost:8080/api/public/v1/events",{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${k.token}`},body:JSON.stringify({v:1,events:batch(model,tag,n)})});
  console.log(model.padEnd(24), r.status, await r.text());
}
await push("gpt-4o-mini","raw",40);
await push("acme/frobnicator-9","unk",20);
await push("openai/gpt-5.5","canon",20);
const roll=await admin.from("usage_rollups").select("model_key, granularity, requests, cost_usd").eq("org_id",org).eq("granularity","day");
const agg=new Map<string,{req:number,cost:number}>();
for(const r of roll.data??[]){const a=agg.get(r.model_key)??{req:0,cost:0};a.req+=r.requests;a.cost+=Number(r.cost_usd);agg.set(r.model_key,a);}
console.log("rollups by model:",[...agg].map(([m,a])=>`${m} req=${a.req} cost=$${a.cost.toFixed(4)}`));
const ev=await admin.from("usage_events").select("model_key").eq("org_id",org);
console.log("raw events preserved:", new Set((ev.data??[]).map(e=>e.model_key)));
console.log(JSON.stringify({email,password,org}));
