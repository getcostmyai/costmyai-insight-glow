import type { ObjectiveRow } from "../engine/objectives";
import { planAtLeast, type ObjectiveKind, type PlanTier } from "../engine/types";

/**
 * Clause 07 — what the workspace is optimising for — surfaced in the dashboard.
 *
 * The selection is an account-wide rule. Stored per-workload objectives are more
 * specific and keep winning, exactly as the engine's resolver defines.
 */

export interface ObjectiveSelection {
  objective: ObjectiveKind;
  qualityFloorScore?: number | null;
  maxLatencyMs?: number | null;
}

export const DEFAULT_SELECTION: ObjectiveSelection = { objective: "cost" };

export const OBJECTIVE_OPTIONS: {
  key: ObjectiveKind;
  label: string;
  hint: string;
  selection: ObjectiveSelection;
}[] = [
  {
    key: "cost",
    label: "Lowest cost",
    hint: "Cheapest candidate that stays inside the measured equivalence band.",
    selection: { objective: "cost" },
  },
  {
    key: "latency",
    label: "Fastest response",
    hint: "Only candidates with a measured median under 1,200 ms.",
    selection: { objective: "latency", maxLatencyMs: 1200 },
  },
  {
    key: "quality_floor",
    label: "Quality floor",
    hint: "Never drop below an absolute benchmark score of 70, whatever it costs.",
    selection: { objective: "quality_floor", qualityFloorScore: 70 },
  },
];

/** Objective selection is a Certify entitlement — it steers the quality check. */
export function objectiveAvailable(plan: PlanTier): boolean {
  return planAtLeast(plan, "certify");
}

export function effectiveSelection(
  plan: PlanTier,
  selection: ObjectiveSelection | null | undefined,
): ObjectiveSelection {
  if (!selection || !objectiveAvailable(plan)) return DEFAULT_SELECTION;
  return selection;
}

export function accountObjectiveRow(selection: ObjectiveSelection): ObjectiveRow {
  return {
    model_key: null,
    host: null,
    task_hint: null,
    objective: selection.objective,
    quality_floor_score: selection.qualityFloorScore ?? null,
    max_latency_ms: selection.maxLatencyMs ?? null,
  };
}

/** Stored rows first; the account-wide selection is the least specific fallback. */
export function mergeObjectives(
  stored: ObjectiveRow[],
  selection: ObjectiveSelection,
): ObjectiveRow[] {
  return [...stored.filter((r) => r.model_key || r.host || r.task_hint), accountObjectiveRow(selection)];
}
