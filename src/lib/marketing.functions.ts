import { createServerFn } from "@tanstack/react-start";
import { queryOptions, type QueryClient } from "@tanstack/react-query";

import type { MarketingStats } from "./marketing.server";

export type { MarketingStats };

/**
 * Public read for the marketing surface. Anon RLS already limits this to the
 * catalogue and sync-log tables, so no workspace data can reach a public page.
 */
export const getMarketingStats = createServerFn({ method: "GET" }).handler(async () => {
  const { readMarketingStats } = await import("./marketing.server");
  return readMarketingStats();
});

export const marketingStatsQuery = () =>
  queryOptions({
    queryKey: ["marketing-stats"],
    queryFn: () => getMarketingStats(),
    staleTime: 5 * 60_000,
    // The hero counters are the one place on the site where a number is
    // presented as living. It only earns that if it actually moves, so the
    // page re-reads them while it is open rather than animating a fixed value
    // on a loop.
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

/**
 * Client-side mirror of the server's degraded shape, duplicated here so the
 * route files never pull the server module into the browser graph.
 */
export const DEGRADED_MARKETING_STATS: MarketingStats = {
  modelCount: 0,
  providerCount: 0,
  priceChangesTracked: 0,
  trackingSince: null,
  providers: [],
  live: false,
  degraded: true,
};

/**
 * Loader entry point for every marketing route.
 *
 * The read itself already degrades server-side; this also covers the transport
 * failing outright. Either way the cache is seeded with a resolvable value, so
 * the page's `useSuspenseQuery` renders counters or nothing instead of leaving
 * the document request unanswered.
 */
export async function ensureMarketingStats(queryClient: QueryClient): Promise<MarketingStats> {
  const options = marketingStatsQuery();
  try {
    return await queryClient.ensureQueryData(options);
  } catch (err) {
    console.error("[marketing-stats] loader degraded:", err instanceof Error ? err.message : err);
    queryClient.setQueryData(options.queryKey, DEGRADED_MARKETING_STATS);
    return DEGRADED_MARKETING_STATS;
  }
}
