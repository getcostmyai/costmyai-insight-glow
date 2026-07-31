export type PlanTier = "compare" | "certify" | "rightsize" | "govern";
export type RecKind = "host_arbitrage" | "quality_match" | "rightsize";
export type ModelTier = "economy" | "standard" | "frontier";
export type ObjectiveKind = "cost" | "latency" | "quality_floor";

export const PLAN_ORDER: PlanTier[] = ["compare", "certify", "rightsize", "govern"];

export const PLAN_META: Record<
  PlanTier,
  { label: string; monthly: number; yearly: number; blurb: string }
> = {
  compare: {
    label: "Compare",
    monthly: 0,
    yearly: 0,
    blurb: "Same model, cheaper host.",
  },
  certify: {
    label: "Certify",
    monthly: 69,
    yearly: 58,
    blurb: "Plus quality-matched cheaper models.",
  },
  rightsize: {
    label: "Rightsize",
    monthly: 389,
    yearly: 324,
    blurb: "Plus oversized-workload detection and manual switching.",
  },
  govern: {
    label: "Govern",
    monthly: 899,
    yearly: 749,
    blurb: "Plus autonomous switching by CostMyAI.",
  },
};

export function planAtLeast(plan: PlanTier, required: PlanTier): boolean {
  return PLAN_ORDER.indexOf(plan) >= PLAN_ORDER.indexOf(required);
}

/** Minimum plan that unlocks each check. */
export const KIND_MIN_PLAN: Record<RecKind, PlanTier> = {
  host_arbitrage: "compare",
  quality_match: "certify",
  rightsize: "rightsize",
};

export interface PriceRow {
  model_key: string;
  host: string;
  host_label: string;
  input_usd_per_mtok: number;
  output_usd_per_mtok: number;
  /** Measured median end-to-end latency. Null when the feed has not measured it. */
  median_latency_ms?: number | null;
  /** Measured median time to first token, in ms. */
  median_ttft_ms?: number | null;
  /** Measured median output tokens per second. */
  output_tps?: number | null;
  /** Whether the latency above was measured on this endpoint or across the model's hosts. */
  latency_scope?: "host" | "model" | null;
}


export interface BenchmarkRow {
  model_key: string;
  suite: string;
  task_class: string;
  score: number;
}

/**
 * The measured Clause 04 equivalence boundary for one suite/task_class.
 * Never a hardcoded constant — it is synced alongside the scores it applies to.
 */
export interface MarginRow {
  suite: string;
  task_class: string;
  margin: number;
}

export interface ModelRow {
  model_key: string;
  display_name: string;
  vendor: string;
  tier: ModelTier;
}

export interface UsageAggregate {
  model_key: string;
  host: string;
  task_hint: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  /** Number of days the aggregate covers, used to normalise to a month. */
  days: number;
  /** Observed output-length shape. Optional; dispersion falls back to 1 when absent. */
  output_p50?: number | null;
  output_p95?: number | null;
}

/** Clause 07 — what the workspace is optimising for. */
export interface Objective {
  objective: ObjectiveKind;
  /** Absolute score floor. Only meaningful for objective === "quality_floor". */
  qualityFloorScore?: number | null;
  /** Hard latency ceiling. Only meaningful for objective === "latency". */
  maxLatencyMs?: number | null;
}

export const DEFAULT_OBJECTIVE: Objective = { objective: "cost" };

export type RefusalReason =
  | "no_baseline_price"
  | "no_baseline_score"
  | "benchmark_not_discriminating"
  | "no_candidate_clears_bar"
  | "no_cheaper_candidate"
  | "latency_ceiling_unmet"
  | "saving_below_floor";

export interface Refusal {
  fromModel: string;
  fromHost: string;
  taskHint: string;
  reason: RefusalReason;
  detail: string;
}

export interface Recommendation {
  kind: RecKind;
  minPlan: PlanTier;
  fromModel: string;
  fromHost: string;
  fromHostLabel: string;
  toModel: string | null;
  toHost: string | null;
  toHostLabel: string | null;
  taskHint: string;
  monthlySavingUsd: number;
  savingPct: number;
  basis: string;
  note: string;
  qualityDelta: number | null;
  /** The measured margin the equivalence decision was made against. */
  marginUsed?: number | null;
  objective?: ObjectiveKind;
}
