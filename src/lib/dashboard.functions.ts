import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOwner } from "./owner-middleware";

import type { ObjectiveKind } from "./engine/types";
import type { DashboardSnapshot, RangeDays } from "./dashboard.server";

export type { DashboardSnapshot, RangeDays };

const OBJECTIVES: ObjectiveKind[] = ["cost", "latency", "quality_floor"];

/**
 * The demo workspace snapshot — owner-only.
 *
 * This is not a public read: the caller must present a valid bearer token AND
 * be the one account allowed to see it. Enforced here, at the data boundary,
 * so hiding the route in the UI is never what keeps it private.
 */
export const getDashboardSnapshot = createServerFn({ method: "GET" })
  .middleware([requireOwner])
  .inputValidator((data: { days?: number; objective?: string } | undefined) => ({
    days: (([1, 7, 30] as number[]).includes(Number(data?.days)) ? Number(data?.days) : 30) as RangeDays,
    objective: (OBJECTIVES.includes(data?.objective as ObjectiveKind)
      ? data?.objective
      : "cost") as ObjectiveKind,
  }))
  .handler(async ({ data }) => {
    const { buildDashboardSnapshot } = await import("./dashboard.server");
    const { DEMO_ORG_ID } = await import("./supabase-public.server");
    // Read with the service client, not the anon one: the demo workspace's
    // public RLS policies are gone, so this is the only remaining path to it —
    // and it is only reachable after requireOwner has passed.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { OBJECTIVE_OPTIONS } = await import("./dashboard/objective");
    const selection =
      OBJECTIVE_OPTIONS.find((o) => o.key === data.objective)?.selection ?? { objective: "cost" };
    return buildDashboardSnapshot({
      days: data.days,
      objective: selection,
      orgId: DEMO_ORG_ID,
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
