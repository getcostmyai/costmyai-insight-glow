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
  /**
   * Real price moves (up or down) we caught between two of our own syncs.
   *
   * This is everything we have, not a calendar-month figure: price_history only
   * contains what we observed ourselves, and OpenRouter publishes current
   * prices only — there is no historical pricing endpoint to backfill from. The
   * count is therefore always paired with `trackingSince` so the page can state
   * the window it actually covers instead of implying a full month.
   */
  priceChangesTracked: number;
  /** First observation in price_history — the honest start of our coverage. */
  trackingSince: string | null;
  /** Provider display names, only for hosts backed by a real live price row. */
  providers: string[];
  /** True only when a pricing sync has actually completed successfully. */
  live: boolean;
}

export async function readMarketingStats(_now: number = Date.now()): Promise<MarketingStats> {
  const supabase = createPublicServerClient();

  const [models, prices, snapshot, changes, firstObservation] = await Promise.all([
    supabase.from("model_catalog").select("model_key", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("host_prices").select("host, host_label").eq("is_active", true).limit(MAX_CATALOG_ROWS),
    supabase
      .from("pricing_snapshots")
      .select("synced_at, status")
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
      .in("change_kind", ["increase", "decrease"]),
    supabase
      .from("price_history")
      .select("observed_at")
      .order("observed_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const priceRows = prices.data ?? [];
  const providers = [...new Set(priceRows.map((p) => p.host_label))].sort((a, b) =>
    a.localeCompare(b),
  );

  return {
    modelCount: models.count ?? 0,
    providerCount: providers.length,
    priceChangesTracked: changes.count ?? 0,
    trackingSince: firstObservation.data?.observed_at ?? null,
    providers,
    live: Boolean(snapshot.data?.synced_at),
  };
}
