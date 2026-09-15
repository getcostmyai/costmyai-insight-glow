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
  /**
   * True when the read failed or ran past its deadline and these are either the
   * last values we held in this worker or nothing at all. The page renders
   * without counters rather than not rendering: a missing number is honest,
   * an unanswerable page is not.
   */
  degraded?: boolean;
}

/** Whole-read deadline. One slow call must not hold the document open. */
export const MARKETING_STATS_TIMEOUT_MS = 3000;

/** Nothing measured: every counter absent, nothing claimed live. */
export const EMPTY_MARKETING_STATS: MarketingStats = {
  modelCount: 0,
  providerCount: 0,
  priceChangesTracked: 0,
  trackingSince: null,
  providers: [],
  live: false,
  degraded: true,
};

/**
 * Last successful read in this worker. Purely a render fallback, never a
 * source of truth: it is only ever served with `degraded: true`.
 */
let lastGood: MarketingStats | null = null;

/** Test seam. */
export function __resetMarketingStatsCache() {
  lastGood = null;
}

/**
 * Never throws. The marketing pages block their SSR on this call, so a backend
 * problem has to come back as missing numbers, not as a request that hangs.
 */
export async function readMarketingStats(now: number = Date.now()): Promise<MarketingStats> {
  try {
    const fresh = await withDeadline(readMarketingStatsUnguarded(now), MARKETING_STATS_TIMEOUT_MS);
    lastGood = fresh;
    return fresh;
  } catch (err) {
    console.error("[marketing-stats] degraded:", err instanceof Error ? err.message : err);
    return lastGood ? { ...lastGood, degraded: true } : EMPTY_MARKETING_STATS;
  }
}

function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`marketing stats timed out after ${ms}ms`)), ms);
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer)) as Promise<T>;
}

async function readMarketingStatsUnguarded(now: number): Promise<MarketingStats> {
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
