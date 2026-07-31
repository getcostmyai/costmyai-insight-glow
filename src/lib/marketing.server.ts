import { relativeAgo } from "./freshness";
import { createPublicServerClient } from "./supabase-public.server";

/**
 * The live numbers the marketing pages are allowed to state.
 *
 * Every figure here is read from the same tables the engine prices against —
 * there are no hardcoded "500+ models" claims on the front page, because a
 * marketing number that drifts from the product is a false claim about a
 * measurement.
 *
 * Freshness (audit C6) comes from `pricing_snapshots.synced_at` — the record of
 * an actual completed sync run — not from `max(host_prices.verified_at)`, which
 * is a property of individual rows and keeps looking fresh even when the feed
 * has stopped running and nothing was upserted.
 */
export interface MarketingStats {
  modelsTracked: number;
  hostsPriced: number;
  pricePoints: number;
  evaluations: number;
  /** ISO timestamp of the last successful pricing sync, or null if none ever ran. */
  pricesSyncedAt: string | null;
  /** Same, pre-formatted so server and client agree on the wording. */
  pricesSyncedAgo: string;
  benchmarksSyncedAt: string | null;
  benchmarksSyncedAgo: string;
  /** How the equivalence margin is computed, stated verbatim from the stored rows. */
  marginMethod: string | null;
}

export async function readMarketingStats(now: number = Date.now()): Promise<MarketingStats> {
  const supabase = createPublicServerClient();

  const [models, prices, margins, snapshot] = await Promise.all([
    supabase.from("model_catalog").select("model_key", { count: "exact", head: true }),
    supabase.from("host_prices").select("host"),
    supabase
      .from("benchmark_margins")
      .select("suite, method, synced_at")
      .eq("is_fixture", false)
      .order("synced_at", { ascending: false }),
    // The sync run itself is the source of truth for "how fresh is this".
    supabase
      .from("pricing_snapshots")
      .select("synced_at, status")
      .eq("status", "ok")
      .order("synced_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const priceRows = prices.data ?? [];
  const marginRows = margins.data ?? [];
  const pricesSyncedAt = snapshot.data?.synced_at ?? null;
  const benchmarksSyncedAt = marginRows[0]?.synced_at ?? null;

  return {
    modelsTracked: models.count ?? 0,
    hostsPriced: new Set(priceRows.map((p) => p.host)).size,
    pricePoints: priceRows.length,
    evaluations: new Set(marginRows.map((m) => m.suite)).size,
    pricesSyncedAt,
    pricesSyncedAgo: relativeAgo(pricesSyncedAt, now),
    benchmarksSyncedAt,
    benchmarksSyncedAgo: relativeAgo(benchmarksSyncedAt, now),
    marginMethod: marginRows[0]?.method ?? null,
  };
}
