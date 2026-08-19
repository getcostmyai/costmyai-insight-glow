import { supabaseAdmin } from "@/integrations/supabase/client.server";
const { data } = await supabaseAdmin.from("benchmarks").select("model_key,suite,task_class,score,measured_at,is_fixture").order("suite");
const bySuite: Record<string, string[]> = {};
for (const b of data ?? []) (bySuite[`${b.suite}|${b.task_class}|${b.is_fixture}`] ??= []).push(`${b.model_key}=${b.score}`);
for (const k of Object.keys(bySuite)) console.log(k, bySuite[k]!.length, bySuite[k]!.slice(0,12).join(" "));
