import { createClient } from "@supabase/supabase-js";
const URL_=process.env.SUPABASE_URL!;
const admin=createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
const email=`d149-p-${Date.now()}@costmyai.test`, pass=`D149-${crypto.randomUUID()}`;
const {data:u,error}=await admin.auth.admin.createUser({email,password:pass,email_confirm:true});
if(error) throw error;
const pub=createClient(URL_, process.env.SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false}});
const si=await pub.auth.signInWithPassword({email,password:pass}); if(si.error) throw si.error;
const {data:p,error:pe}=await admin.from("partners").insert({name:"D149 one",referral_code:`D149ONE${Date.now()%100000}`,status:"active"}).select("id").single(); if(pe) throw pe;

const FN="eyJmaWxlIjoiL3NyYy9saWIvZGVtby1hY2Nlc3MuZnVuY3Rpb25zLnRzP3Rzcy1zZXJ2ZXJmbi1zcGxpdCIsImV4cG9ydCI6ImdldERlbW9BY2Nlc3NfY3JlYXRlU2VydmVyRm5faGFuZGxlciJ9";
const r=await fetch(`http://localhost:8080/_serverFn/${FN}?payload=${encodeURIComponent('{"t":{"t":10,"i":0,"p":{"k":["data"],"v":[{"t":10,"i":1,"p":{"k":["days","objective"],"v":[{"t":0,"s":30},{"t":1,"s":"cost"}]},"o":0}]},"o":0},"f":63,"m":[]}')}`,{headers:{origin:"http://localhost:8080",authorization:`Bearer ${si.data.session!.access_token}`}});
const body=await r.text();
console.log(r.status, body.length);
console.log(body.replace(/\s+/g," ").slice(0,3000));
await admin.from("partner_users").delete().eq("partner_id",p.id);
await admin.from("partners").delete().eq("id",p.id);
await admin.auth.admin.deleteUser(u.user!.id);
