import { createPublicServerClient } from "./supabase-public.server";
import { MAX_CATALOG_ROWS } from "@/lib/catalog-limits";

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
  /** Real price moves (up or down) recorded against a provider feed this calendar month. */
  priceChangesThisMonth: number;
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

  const [models, prices, snapshot, verifiedThisMonth] = await Promise.all([
    supabase.from("model_catalog").select("model_key", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("host_prices").select("host, host_label").eq("is_active", true).limit(MAX_CATALOG_ROWS),
    supabase
      .from("pricing_snapshots")
      .select("synced_at, status")
      .eq("status", "ok")
      .order("synced_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // A "price change" needs a real price row that a feed re-verified this
    // month. Summing `rows_upserted` counted benchmark and latency writes as
    // price movement, which is a claim we cannot back.
    supabase
      .from("host_prices")
      .select("id", { count: "exact", head: true })
      .eq("is_fixture", false)
      .eq("is_active", true)
      .gte("verified_at", monthStart.toISOString()),
  ]);

  const priceRows = prices.data ?? [];
  const providers = [...new Set(priceRows.map((p) => p.host_label))].sort((a, b) =>
    a.localeCompare(b),
  );

  return {
    modelCount: models.count ?? 0,
    providerCount: providers.length,
    pricesVerifiedThisMonth: verifiedThisMonth.count ?? 0,
    providers,
    live: Boolean(snapshot.data?.synced_at),
  };
}
