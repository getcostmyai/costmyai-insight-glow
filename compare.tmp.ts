import { createClient } from "@supabase/supabase-js";

import { runPipeline } from "./src/lib/engine/pipeline";

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const DEMO_ORG_ID = (await import("./src/lib/supabase-public.server")).DEMO_ORG_ID;

const since = new Date(Date.now() - 30 * 864e5).toISOString();
const [rollups, prices, models, fixtureBm, realBm, realMargins] = await Promise.all([
  sb
    .from("usage_rollups")
    .select("model_key, host, task_hint, requests, input_tokens, output_tokens, cost_usd")
    .eq("org_id", DEMO_ORG_ID)
    .gte("bucket_start", since),
  sb
    .from("host_prices")
    .select("model_key, host, host_label, input_usd_per_mtok, output_usd_per_mtok, median_latency_ms"),
  sb.from("model_catalog").select("model_key, display_name, vendor, tier"),
  sb.from("benchmarks").select("model_key, suite, task_class, score").eq("is_fixture", true),
  sb.from("benchmarks").select("model_key, suite, task_class, score").eq("is_fixture", false),
  sb.from("benchmark_margins").select("suite, task_class, margin").eq("is_fixture", false),
]);

const byWorkload = new Map<string, any>();
for (const r of rollups.data ?? []) {
  const key = `${r.model_key}|${r.host}|${r.task_hint}`;
  const e = byWorkload.get(key) ?? {
    model_key: r.model_key,
    host: r.host,
    task_hint: r.task_hint,
    requests: 0,
    input_tokens: 0,
    output_tokens: 0,
    cost_usd: 0,
    days: 30,
  };
  e.requests += +r.requests;
  e.input_tokens += +r.input_tokens;
  e.output_tokens += +r.output_tokens;
  e.cost_usd += +r.cost_usd;
  byWorkload.set(key, e);
}
const usage = [...byWorkload.values()];
const num = (rows: any[], f: string) => rows.map((r) => ({ ...r, [f]: Number(r[f]) }));

function run(bm: any[], margins: any[]) {
  return runPipeline({
    usage,
    prices: num(prices.data ?? [], "input_usd_per_mtok").map((p) => ({
      ...p,
      output_usd_per_mtok: Number(p.output_usd_per_mtok),
      median_latency_ms: p.median_latency_ms == null ? null : Number(p.median_latency_ms),
    })) as any,
    benchmarks: num(bm, "score") as any,
    margins: num(margins, "margin") as any,
    models: (models.data ?? []) as any,
  });
}

const before = run(fixtureBm.data ?? [], []);
const after = run(realBm.data ?? [], realMargins.data ?? []);

const fmt = (r: any) =>
  `${r.fromModel}@${r.fromHost} -> ${r.toModel}@${r.toHost} | $${r.monthlySavingUsd.toFixed(2)}/mo | Δ${r.qualityDelta ?? "-"} | ±${r.marginUsed ?? "-"} | ${r.basis}`;

for (const [label, res] of [
  ["BEFORE (fixtures, no margin rows)", before],
  ["AFTER (real AA data + measured margins)", after],
] as const) {
  console.log(`\n===== ${label} =====`);
  console.log("-- quality (Certify) certified --");
  res.quality.recommendations.forEach((r: any) => console.log("  " + fmt(r)));
  console.log("-- quality refusals --");
  res.quality.refusals.forEach((r: any) =>
    console.log(`  ${r.fromModel}@${r.fromHost} [${r.taskHint}] : ${r.reason} ${r.detail ?? ""}`),
  );
  console.log("-- host arbitrage (Compare) --");
  res.arbitrage.recommendations.forEach((r: any) => console.log("  " + fmt(r)));
  console.log("-- rightsize flags --");
  res.rightsize.recommendations.forEach((r: any) => console.log("  " + fmt(r)));
}
