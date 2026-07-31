import { createServerFn } from "@tanstack/react-start";

import type { DashboardSnapshot, RangeDays } from "./dashboard.server";

export type { DashboardSnapshot, RangeDays };

/**
 * Public read: the demo workspace's dashboard. Anon RLS policies scope this to
 * the synthetic demo org and nothing else.
 */
export const getDashboardSnapshot = createServerFn({ method: "GET" })
  .inputValidator((data: { days?: number } | undefined) => ({
    days: (([1, 7, 30] as number[]).includes(Number(data?.days)) ? Number(data?.days) : 30) as RangeDays,
  }))
  .handler(async ({ data }) => {
    const { buildDashboardSnapshot } = await import("./dashboard.server");
    return buildDashboardSnapshot(data.days);
  });
