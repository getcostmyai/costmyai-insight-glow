import { createClient } from "@supabase/supabase-js";
import { runPipeline } from "./src/lib/engine/pipeline";

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const since = new Date(Date.now() - 30 * 864e5).toISOString();
const [ro, pr, be, ma, mo] = await Promise.all([
  sb.from("usage_rollups").select("model_key,host,task_hint,requests,input_tokens,output_tokens,cost_usd").gte("bucket_start", since),
  sb.from("host_prices").select("model_key,host,host_label,input_usd_per_mtok,output_usd_per_mtok,median_latency_ms"),
  sb.from("benchmarks").select("model_key,suite,task_class,score").eq("is_fixture", false),
  sb.from("benchmark_margins").select("suite,task_class,margin"),
  sb.from("model_catalog").select("model_key,display_name,vendor,tier"),
]);
const map = new Map<string, any>();
for (const r of ro.data ?? []) {
  const k = `${r.model_key}|${r.host}|${r.task_hint}`;
  const e = map.get(k) ?? { model_key: r.model_key, host: r.host, task_hint: r.task_hint, requests: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0, days: 30 };
  e.requests += +r.requests; e.input_tokens += +r.input_tokens; e.output_tokens += +r.output_tokens; e.cost_usd += +r.cost_usd;
  map.set(k, e);
}
const out = runPipeline({
  usage: [...map.values()],
  prices: (pr.data ?? []).map((p: any) => ({ ...p, input_usd_per_mtok: +p.input_usd_per_mtok, output_usd_per_mtok: +p.output_usd_per_mtok })),
  benchmarks: (be.data ?? []).map((b: any) => ({ ...b, score: +b.score })),
  margins: (ma.data ?? []).map((m: any) => ({ ...m, margin: +m.margin })),
  models: (mo.data ?? []) as any,
});
const reasons: Record<string, number> = {};
for (const r of out.refusals) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
console.log(JSON.stringify({ benchmarkRows: be.data?.length, marginRows: ma.data?.length, stats: out.stats, reasons, certified: out.qualityMatched.map(r => `${r.fromModel}->${r.toModel} $${r.monthlySavingUsd} Δ${r.qualityDelta} ±${r.marginUsed}`) }, null, 2));
