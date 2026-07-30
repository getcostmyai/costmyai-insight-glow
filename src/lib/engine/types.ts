export type PlanTier = "compare" | "certify" | "rightsize" | "govern";
export type RecKind = "host_arbitrage" | "quality_match" | "rightsize";
export type ModelTier = "economy" | "standard" | "frontier";

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
}

export interface BenchmarkRow {
  model_key: string;
  task_class: string;
  score: number;
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
}
