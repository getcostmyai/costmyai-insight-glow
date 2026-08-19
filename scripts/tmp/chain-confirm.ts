import { supabaseAdmin } from "@/integrations/supabase/client.server";
const email = "chain.drill.aug19@costmyai.dev";
const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page:1, perPage:200 });
const u = list.users.find(x => x.email === email);
if (!u) { console.log("not found"); process.exit(1); }
const { data, error } = await supabaseAdmin.auth.admin.updateUserById(u.id, { email_confirm: true });
console.log(error ?? { id: data.user.id, confirmed: data.user.email_confirmed_at });
