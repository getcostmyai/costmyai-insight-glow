import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const { readCatalog } = await import("@/lib/catalog/catalog.server");
const { readMarketingStats } = await import("@/lib/marketing.server");
const { benchmarksAreCertifiable, BENCHMARK_FEED } = await import("@/lib/sync-freshness");

async function lastBenchmarkSync() {
  const { data } = await admin
    .from("pricing_snapshots")
    .select("synced_at")
    .eq("feed", BENCHMARK_FEED)
    .eq("status", "ok")
    .order("synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.synced_at ?? null;
}

async function report(label: string) {
  const [cat, mkt, bench] = await Promise.all([readCatalog(), readMarketingStats(), lastBenchmarkSync()]);
  console.log(label, {
    catalogLive: cat.live,
    marketingLive: mkt.live,
    lastBenchmarkSync: bench,
    benchmarksCertifiable: benchmarksAreCertifiable(bench, Date.now()),
  });
}

await report("BEFORE (healthy):");

// Hide the recent successful runs of BOTH feeds, exactly as an outage would.
const cutoffPrices = new Date(Date.now() - 60 * 60_000).toISOString();
const cutoffBench = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
const { data: hiddenPrices } = await admin
  .from("pricing_snapshots")
  .update({ status: "outage_drill" })
  .eq("feed", "openrouter")
  .eq("status", "ok")
  .gte("synced_at", cutoffPrices)
  .select("id");
const { data: hiddenBench } = await admin
  .from("pricing_snapshots")
  .update({ status: "outage_drill" })
  .eq("feed", "artificial_analysis")
  .eq("status", "ok")
  .gte("synced_at", cutoffBench)
  .select("id");
console.log(`hid ${hiddenPrices?.length ?? 0} pricing runs, ${hiddenBench?.length ?? 0} benchmark runs`);

try {
  await report("DURING OUTAGE:");
} finally {
  const ids = [...(hiddenPrices ?? []), ...(hiddenBench ?? [])].map((r) => r.id);
  const { error } = await admin
    .from("pricing_snapshots")
    .update({ status: "ok" })
    .in("id", ids);
  console.log("restored:", ids.length, error?.message ?? "ok");
}

await report("AFTER RESTORE:");
process.exit(0);
