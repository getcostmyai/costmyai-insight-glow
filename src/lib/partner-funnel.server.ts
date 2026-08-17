import type { SupabaseClient } from "@supabase/supabase-js";

export const FUNNEL_WINDOWS = [7, 30, 90] as const;
export type FunnelWindow = (typeof FUNNEL_WINDOWS)[number];

export interface FunnelStageRow {
  stage: string;
  stageOrder: number;
  visitors: number;
  ratePct: number | null;
}

const STAGE_LABELS: Record<string, string> = {
  estimator_viewed: "Estimator viewed",
  estimator_engaged: "Estimator engaged",
  estimator_completed: "Estimator completed",
  workspace_created: "Workspace created",
  plan_changed: "Plan changed",
  switch_activated: "Switch activated",
};

export function stageLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? stage.replace(/_/g, " ");
}

/**
 * The partner id is never taken from the request: it is resolved from the
 * caller's own `partner_users` row through their RLS-scoped client, so the
 * only funnel anyone can read is their own. `funnel_summary_for_partner` is
 * SECURITY DEFINER and re-checks membership itself — this is belt and braces.
 */
export async function readMyFunnel(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  userId: string,
  windowDays: FunnelWindow,
): Promise<FunnelStageRow[] | null> {
  const membership = await supabase
    .from("partner_users")
    .select("partner_id")
    .eq("user_id", userId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (membership.error) throw membership.error;
  if (!membership.data) return null;

  const { data, error } = await supabase.rpc("funnel_summary_for_partner", {
    _partner_id: membership.data.partner_id,
    _window_days: windowDays,
  });
  if (error) throw error;

  return (data ?? [])
    .map((r: { stage: string; stage_order: number; visitors: number; rate_from_previous_pct: number | null }) => ({
      stage: r.stage,
      stageOrder: Number(r.stage_order),
      visitors: Number(r.visitors),
      ratePct: r.rate_from_previous_pct === null ? null : Number(r.rate_from_previous_pct),
    }))
    .sort((a: FunnelStageRow, b: FunnelStageRow) => a.stageOrder - b.stageOrder);
}
