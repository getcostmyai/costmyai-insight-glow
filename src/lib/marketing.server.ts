import { createPublicServerClient } from "./supabase-public.server";
import { fetchAllRows } from "@/lib/paginate.server";
import { countRealProviders, isRealEndpoint } from "@/lib/pricing/aggregate";
import { PRICING_FEED, pricingIsLive } from "@/lib/sync-freshness";


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
  /**
   * Distinct REAL providers we hold a verified live price for. The OpenRouter
   * aggregate listing is a purchasable option, not a company serving weights,
   * so it is excluded here exactly as it is on the Intelligence page — both
   * surfaces now count through `countRealProviders` (Dispatch 117).
   */
  providerCount: number;

  /**
   * Real price moves (up or down) we caught between two of our own syncs during
   * the current calendar month (UTC). The counter resets on the 1st of each
   * month. price_history itself is append-only and never pruned — this is a
   * read-side window only.
   */
  priceChangesTracked: number;
  /** First observation in price_history — the honest start of our coverage. */
  trackingSince: string | null;
  /** Provider display names, only for hosts backed by a real live price row. */
  providers: string[];
  /** True only when a pricing sync completed successfully RECENTLY (age-bounded). */
  live: boolean;
}

export async function readMarketingStats(now: number = Date.now()): Promise<MarketingStats> {
  const supabase = createPublicServerClient();

  const nowDate = new Date(now);
  const monthStart = new Date(
    Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), 1, 0, 0, 0, 0),
  ).toISOString();

  const [models, prices, snapshot, changes, firstObservation] = await Promise.all([
    supabase.from("model_catalog").select("model_key", { count: "exact", head: true }).eq("is_active", true),
    fetchAllRows((f, t) =>
      supabase
        .from("host_prices")
        .select("host, host_label, price_source")
        .eq("is_active", true)
        .range(f, t),
    ).then((data) => ({ data })),

    supabase
      .from("pricing_snapshots")
      .select("synced_at, status")
      .eq("feed", PRICING_FEED)
      .eq("status", "ok")
      .order("synced_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // A "price change" is a real move we caught between two syncs — an increase
    // or a decrease recorded in price_history. First-sight rows ("new") and
    // delistings are not price movement, so they are excluded.
    supabase
      .from("price_history")
      .select("id", { count: "exact", head: true })
      .in("change_kind", ["increase", "decrease"])
      .gte("observed_at", monthStart),
    supabase
      .from("price_history")
      .select("observed_at")
      .order("observed_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const priceRows = prices.data ?? [];
  // The marquee names providers, so it lists real endpoints only — an
  // aggregator logo in a row of companies that serve weights is a false claim
  // about who serves what.
  const providers = [...new Set(priceRows.filter(isRealEndpoint).map((p) => p.host_label))].sort(
    (a, b) => a.localeCompare(b),
  );

  return {
    modelCount: models.count ?? 0,
    providerCount: countRealProviders(priceRows),

    priceChangesTracked: changes.count ?? 0,
    trackingSince: firstObservation.data?.observed_at ?? null,
    providers,
    // Bounded by age, not by "a sync succeeded once": see sync-freshness.ts.
    live: pricingIsLive(snapshot.data?.synced_at ?? null, now),
  };
}
