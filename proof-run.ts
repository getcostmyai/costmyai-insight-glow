import { createClient } from "@supabase/supabase-js";

const scenario = process.argv[2]!;
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

async function latest(feed: string) {
  const { data } = await admin
    .from("pricing_snapshots")
    .select("status, error_detail, synced_at, finished_at")
    .eq("feed", feed)
    .order("synced_at", { ascending: false })
    .limit(3);
  return data;
}

const started = Date.now();
try {
  if (scenario.startsWith("aa")) {
    const { syncArtificialAnalysis, recordSyncFailure } = await import(
      "@/lib/benchmarks/aa-sync.server"
    );
    try {
      await syncArtificialAnalysis();
      console.log("UNEXPECTED: sync succeeded");
    } catch (e) {
      console.log("THROWN:", (e as Error).message, `after ${Date.now() - started}ms`);
      await recordSyncFailure((e as Error).message);
    }
    console.log("LEDGER:", JSON.stringify(await latest("artificial_analysis"), null, 1));
  } else {
    const { syncOpenRouterPricing, recordPriceSyncFailure } = await import(
      "@/lib/pricing/sync.server"
    );
    try {
      const r = await syncOpenRouterPricing();
      console.log("UNEXPECTED: sync returned", JSON.stringify(r).slice(0, 200));
    } catch (e) {
      console.log("THROWN:", (e as Error).message, `after ${Date.now() - started}ms`);
      await recordPriceSyncFailure((e as Error).message);
    }
    console.log("LEDGER:", JSON.stringify(await latest("openrouter"), null, 1));
  }
} finally {
  process.exit(0);
}
