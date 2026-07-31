import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";

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
  });
