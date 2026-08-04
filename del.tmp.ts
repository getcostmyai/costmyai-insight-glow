import { createClient } from "@supabase/supabase-js";
const URL=process.env["SUPABASE_URL"]!, SVC=process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
const f=(key:string):typeof fetch=>(i,init)=>{const h=new Headers(init?.headers);if(key.startsWith("sb_")&&h.get("Authorization")===`Bearer ${key}`)h.delete("Authorization");h.set("apikey",key);return fetch(i,{...init,headers:h});};
const admin=createClient(URL,SVC,{global:{fetch:f(SVC)},auth:{persistSession:false}});
const r = await admin.from("organizations").delete().eq("id","61a30b03-a32a-43d7-9add-5eb0f01271e9").select("id");
console.log("delete result:", JSON.stringify(r.error), "rows:", r.data?.length);
