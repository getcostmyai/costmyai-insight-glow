import { DEFAULT_OBJECTIVE, type Objective, type UsageAggregate } from "./types";

/** A stored objective row: null workload columns mean "account-wide default". */
export interface ObjectiveRow {
  model_key: string | null;
  host: string | null;
  task_hint: string | null;
  objective: Objective["objective"];
  quality_floor_score: number | null;
  max_latency_ms: number | null;
}

function specificity(row: ObjectiveRow): number {
  return (
    (row.model_key ? 4 : 0) + (row.host ? 2 : 0) + (row.task_hint ? 1 : 0)
  );
}

function matches(row: ObjectiveRow, u: UsageAggregate): boolean {
  if (row.model_key && row.model_key !== u.model_key) return false;
  if (row.host && row.host !== u.host) return false;
  if (row.task_hint && row.task_hint !== u.task_hint) return false;
  return true;
}

/**
 * Clause 07 resolution: the most specific matching rule wins, so a per-workload
 * objective always overrides the account-wide one. With nothing configured the
 * engine optimises for cost.
 */
export function resolveObjective(rows: ObjectiveRow[], u: UsageAggregate): Objective {
  const applicable = rows.filter((r) => matches(r, u));
  if (applicable.length === 0) return DEFAULT_OBJECTIVE;
  applicable.sort((a, b) => specificity(b) - specificity(a));
  const winner = applicable[0];
  return {
    objective: winner.objective,
    qualityFloorScore: winner.quality_floor_score,
    maxLatencyMs: winner.max_latency_ms,
  };
}

export function objectiveResolver(rows: ObjectiveRow[]) {
  return (u: UsageAggregate) => resolveObjective(rows, u);
}
