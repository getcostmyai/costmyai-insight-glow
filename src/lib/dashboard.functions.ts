import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireDemoAccess } from "./owner-middleware";

import type { ObjectiveKind } from "./engine/types";
import type { DashboardSnapshot, RangeDays } from "./dashboard.server";

export type { DashboardSnapshot, RangeDays };

const OBJECTIVES: ObjectiveKind[] = ["cost", "latency", "quality_floor"];

/**
 * The demo workspace snapshot — owner, or a real, currently-active partner.
 *
 * This is not a public read: the caller must present a valid bearer token AND
 * pass the demo guard. Which workspace they get is derived from who they are
 * (`context.demoOrgId`), never from the request, so a partner cannot reach the
 * internal workspace and vice versa. Enforced here, at the data boundary, so
 * hiding the route in the UI is never what keeps it private.
 */
export const getDashboardSnapshot = createServerFn({ method: "GET" })
  .middleware([requireDemoAccess])
  .inputValidator((data: { days?: number; objective?: string } | undefined) => ({
    days: (([1, 7, 30] as number[]).includes(Number(data?.days)) ? Number(data?.days) : 30) as RangeDays,
    objective: (OBJECTIVES.includes(data?.objective as ObjectiveKind)
      ? data?.objective
      : "cost") as ObjectiveKind,
  }))
  .handler(async ({ data, context }) => {
    const { buildDashboardSnapshot } = await import("./dashboard.server");
    // Read with the service client, not the anon one: the demo workspace's
    // public RLS policies are gone, so this is the only remaining path to it —
    // and it is only reachable after the demo guard has passed.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { OBJECTIVE_OPTIONS } = await import("./dashboard/objective");
    const selection =
      OBJECTIVE_OPTIONS.find((o) => o.key === data.objective)?.selection ?? { objective: "cost" };
    return buildDashboardSnapshot({
      days: data.days,
      objective: selection,
      orgId: context.demoOrgId,
      client: supabaseAdmin as never,
    });
  });



const snapshotInput = (data: { days?: number; objective?: string } | undefined) => ({
  days: (([1, 7, 30] as number[]).includes(Number(data?.days)) ? Number(data?.days) : 30) as RangeDays,
  objective: (OBJECTIVES.includes(data?.objective as ObjectiveKind)
    ? data?.objective
    : "cost") as ObjectiveKind,
});

/**
 * The signed-in user's own workspace.
 *
 * The org is resolved server-side from the caller's memberships and the read
 * runs through their RLS-scoped client, so no workspace id crosses the wire and
 * no request body can point this at someone else's data.
 */
export const getMyDashboardSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(snapshotInput)
  .handler(async ({ data, context }) => {
    const { buildDashboardSnapshot } = await import("./dashboard.server");
    const { OBJECTIVE_OPTIONS } = await import("./dashboard/objective");

    const { data: membership, error } = await context.supabase
      .from("memberships")
      .select("org_id, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!membership) throw new Error("NO_WORKSPACE");

    const selection =
      OBJECTIVE_OPTIONS.find((o) => o.key === data.objective)?.selection ?? { objective: "cost" };
    return buildDashboardSnapshot({
      days: data.days,
      objective: selection,
      orgId: membership.org_id,
      client: context.supabase as never,
    });
  });
