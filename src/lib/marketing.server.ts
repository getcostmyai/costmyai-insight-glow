import { createPublicServerClient } from "./supabase-public.server";
import { fetchAllRows } from "@/lib/paginate.server";
import { countRealProviders, isRealEndpoint } from "@/lib/pricing/aggregate";


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
  /** True only when a pricing sync has actually completed successfully. */
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
      supabase.from("host_prices").select("host, host_label").eq("is_active", true).range(f, t),
    ).then((data) => ({ data })),
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
