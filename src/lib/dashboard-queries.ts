import { keepPreviousData, queryOptions } from "@tanstack/react-query";

import type { ObjectiveKind } from "./engine/types";
import { getDashboardSnapshot } from "./dashboard.functions";

export type RangeKey = "24h" | "7d" | "30d";

export const ranges: { key: RangeKey; label: string; long: string; days: 1 | 7 | 30 }[] = [
  { key: "24h", label: "24h", long: "last 24 hours", days: 1 },
  { key: "7d", label: "7d", long: "last 7 days", days: 7 },
  { key: "30d", label: "30d", long: "last 30 days", days: 30 },
];

export const rangeFor = (key: RangeKey) => ranges.find((r) => r.key === key)!;

export const dashboardQuery = (range: RangeKey, objective: ObjectiveKind = "cost") =>
  queryOptions({
    queryKey: ["dashboard", range, objective],
    queryFn: () => getDashboardSnapshot({ data: { days: rangeFor(range).days, objective } }),
    staleTime: 60_000,
    // Switching range keeps the last window on screen instead of blanking it.
    placeholderData: keepPreviousData,
  });
