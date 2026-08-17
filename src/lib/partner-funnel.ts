export const FUNNEL_WINDOWS = [7, 30, 90] as const;
export type FunnelWindow = (typeof FUNNEL_WINDOWS)[number];

export interface FunnelStageRow {
  stage: string;
  stageOrder: number;
  visitors: number;
  /** Conversion from the previous stage; null for the first stage or a zero base. */
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
