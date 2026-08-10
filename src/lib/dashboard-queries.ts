import { keepPreviousData, queryOptions } from "@tanstack/react-query";

import type { ObjectiveKind } from "./engine/types";
import { getDashboardSnapshot, getMyDashboardSnapshot } from "./dashboard.functions";

export type RangeKey = "24h" | "7d" | "30d";

/** "demo" reads the public synthetic workspace; "mine" reads the caller's own. */
export type DashboardScope = "demo" | "mine";

export const ranges: { key: RangeKey; label: string; long: string; days: 1 | 7 | 30 }[] = [
  { key: "24h", label: "24h", long: "last 24 hours", days: 1 },
  { key: "7d", label: "7d", long: "last 7 days", days: 7 },
  { key: "30d", label: "30d", long: "last 30 days", days: 30 },
];

export const rangeFor = (key: RangeKey) => ranges.find((r) => r.key === key)!;

/**
 * Dispatch 170. The container flushes every 30s by default
 * (packages/gateway-container/src/config.ts), so a connected workspace can gain
 * new events twice a minute. Refetching on that cadence is what makes the
 * "Live · streaming from your gateway" banner true: before this, the only thing
 * moving between mount and window-focus was a client-side extrapolation.
 *
 * 30s matches the flush exactly. It only runs while the snapshot itself says
 * ingest is live — a quiet, disconnected or never-connected workspace has
 * nothing to poll for and is left alone.
 */
export const DASHBOARD_LIVE_REFETCH_MS = 30_000;

export const dashboardQuery = (
  range: RangeKey,
  objective: ObjectiveKind = "cost",
  scope: DashboardScope = "demo",
) =>
  queryOptions({
    queryKey: ["dashboard", scope, range, objective],
    queryFn: () => {
      const data = { days: rangeFor(range).days, objective };
      return scope === "mine" ? getMyDashboardSnapshot({ data }) : getDashboardSnapshot({ data });
    },
    // Below the poll interval, so a scheduled tick actually re-reads the server
    // instead of being served the cached snapshot back.
    staleTime: 15_000,
    refetchInterval: (query) =>
      query.state.data?.ingest.state === "live" ? DASHBOARD_LIVE_REFETCH_MS : false,
    // Switching range keeps the last window on screen instead of blanking it.
    placeholderData: keepPreviousData,
  });
