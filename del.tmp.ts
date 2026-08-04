import { createClient } from "@supabase/supabase-js";
const URL=process.env["SUPABASE_URL"]!, SVC=process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
const f=(key:string):typeof fetch=>(i,init)=>{const h=new Headers(init?.headers);if(key.startsWith("sb_")&&h.get("Authorization")===`Bearer ${key}`)h.delete("Authorization");h.set("apikey",key);return fetch(i,{...init,headers:h});};
const admin=createClient(URL,SVC,{global:{fetch:f(SVC)},auth:{persistSession:false}});
for (const id of ["d49b55b9-f5f8-4eac-8e7d-155f972681be","0c99c96e-eb9b-4d99-8785-369fcd01cc5c"]) {
  const r = await admin.from("organizations").delete().eq("id",id).select("id");
  console.log(id, "err:", JSON.stringify(r.error), "rows:", r.data?.length);
}
const { data: users } = await admin.auth.admin.listUsers({ perPage: 200 });
for (const u of users.users) if (/@costmyai-test\.dev$/.test(u.email ?? "")) {
  const d = await admin.auth.admin.deleteUser(u.id);
  console.log("user", u.email, d.error ? d.error.message : "deleted");
}
