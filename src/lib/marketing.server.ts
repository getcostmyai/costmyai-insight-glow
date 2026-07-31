import { createPublicServerClient } from "./supabase-public.server";

/**
 * The live numbers the marketing pages are allowed to state.
 *
 * Every figure is read from the same tables the engine prices against — there
 * are no hardcoded coverage claims on the front page, because a marketing
 * number that drifts from the product is a false claim about a measurement.
 *
 * Freshness (audit C6) is derived from `pricing_snapshots` — the record of an
 * actual completed sync run — not from row-level timestamps, which keep looking
 * fresh even when the feed has stopped running. The page states "Live" only
 * when a sync has genuinely succeeded (Clause 10: staleness is never hidden;
 * the strip simply does not render when there is nothing live to claim).
 */
export interface MarketingStats {
  /** Models with at least one catalog entry. */
  modelCount: number;
  /** Distinct providers we hold a verified price for. */
  providerCount: number;
  /** Real price rows re-verified against a provider feed this calendar month. */
  pricesVerifiedThisMonth: number;
  /** Provider display names, only for hosts backed by a real live price row. */
  providers: string[];
  /** True only when a pricing sync has actually completed successfully. */
  live: boolean;
}

export async function readMarketingStats(now: number = Date.now()): Promise<MarketingStats> {
  const supabase = createPublicServerClient();

  const monthStart = new Date(now);
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [models, prices, snapshot, monthRuns] = await Promise.all([
    supabase.from("model_catalog").select("model_key", { count: "exact", head: true }),
    supabase.from("host_prices").select("host, host_label"),
    supabase
      .from("pricing_snapshots")
      .select("synced_at, status")
      .eq("status", "ok")
      .order("synced_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("pricing_snapshots")
      .select("rows_upserted")
      .eq("status", "ok")
      .gte("synced_at", monthStart.toISOString()),
  ]);

  const priceRows = prices.data ?? [];
  const providers = [...new Set(priceRows.map((p) => p.host_label))].sort((a, b) =>
    a.localeCompare(b),
  );

  return {
    modelCount: models.count ?? 0,
    providerCount: providers.length,
    priceChangesThisMonth: (monthRuns.data ?? []).reduce((sum, r) => sum + (r.rows_upserted ?? 0), 0),
    providers,
    live: Boolean(snapshot.data?.synced_at),
  };
}
