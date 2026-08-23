import type { FunnelStageRow } from "@/lib/partner-funnel";

export const ADMIN_WINDOWS = [7, 30, 90] as const;
export type AdminWindow = (typeof ADMIN_WINDOWS)[number];

export interface EventBreakdownRow {
  eventType: string;
  events: number;
  visitors: number;
  /** Distinct sessions. Rows written before session tracking carry no session. */
  sessions: number;
  /** Events with no session id at all — pre-date session tracking, never counted as sessions. */
  legacyEvents: number;
  firstAt: string | null;
  lastAt: string | null;
}

export interface AdminSummary {
  jobs: { total: number; healthy: number; stale: number; failing: number } | null;
  leadsPending: number | null;
  applicationsPending: number | null;
  payouts: { count: number; amountUsd: number; environment: string } | null;
  referrals: { total: number; direct: number; partnerReferred: number; partnerPct: number } | null;
  /** Real workspaces after test-harness and no-contact rows are filtered out. */
  customers: { shown: number; internal: number; excluded: number } | null;
  /** Anything that failed to load says so, rather than rendering a confident zero. */
  errors: string[];
}

export interface AdminOverview {
  windowDays: AdminWindow;
  funnel: FunnelStageRow[];
  events: EventBreakdownRow[];
  totals: { events: number; visitors: number; sessions: number; legacyEvents: number };
  summary: AdminSummary;
  readAt: string;
}

const LABELS: Record<string, string> = {
  page_viewed: "Page viewed",
  estimator_viewed: "Estimator viewed",
  estimator_engaged: "Estimator engaged",
  estimator_line_added: "Estimator line added",
  estimator_line_changed: "Estimator line changed",
  estimator_line_removed: "Estimator line removed",
  estimator_split_changed: "Estimator split changed",
  estimator_completed: "Estimator completed",
  models_page_viewed: "Models page viewed",
  models_filtered: "Models filtered",
  models_sorted: "Models sorted",
  models_searched: "Models searched",
  partner_page_viewed: "Partner page viewed",
  partner_apply_started: "Partner apply started",
  partner_apply_step_completed: "Partner apply step completed",
  intelligence_card_shared: "Intelligence card shared",
  workspace_created: "Workspace created",
  plan_changed: "Plan changed",
};

export function eventLabel(eventType: string): string {
  return LABELS[eventType] ?? eventType.replace(/_/g, " ");
}
