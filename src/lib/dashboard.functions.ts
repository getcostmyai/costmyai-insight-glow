import { createServerFn } from "@tanstack/react-start";

import type { ObjectiveKind } from "./engine/types";
import type { DashboardSnapshot, RangeDays } from "./dashboard.server";

export type { DashboardSnapshot, RangeDays };

const OBJECTIVES: ObjectiveKind[] = ["cost", "latency", "quality_floor"];

/**
 * Public read: the demo workspace's dashboard. Anon RLS policies scope this to
 * the synthetic demo org and nothing else.
 */
export const getDashboardSnapshot = createServerFn({ method: "GET" })
  .inputValidator((data: { days?: number; objective?: string } | undefined) => ({
    days: (([1, 7, 30] as number[]).includes(Number(data?.days)) ? Number(data?.days) : 30) as RangeDays,
    objective: (OBJECTIVES.includes(data?.objective as ObjectiveKind)
      ? data?.objective
      : "cost") as ObjectiveKind,
  }))
  .handler(async ({ data }) => {
    const { buildDashboardSnapshot } = await import("./dashboard.server");
    const { OBJECTIVE_OPTIONS } = await import("./dashboard/objective");
    const selection =
      OBJECTIVE_OPTIONS.find((o) => o.key === data.objective)?.selection ?? { objective: "cost" };
    return buildDashboardSnapshot({ days: data.days, objective: selection });
  });
