import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
console.log(await sb.from("benchmarks").delete().like("suite", "aa%").select("id").then(r => ({ deleted: r.data?.length, err: r.error })));
console.log(await sb.from("benchmark_margins").delete().like("suite", "aa%").select("id").then(r => ({ deleted: r.data?.length, err: r.error })));
