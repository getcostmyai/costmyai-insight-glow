import type { PlanTier, RecKind } from "../engine/types";
import type { DashboardScope } from "../dashboard-queries";

/**
 * The product's four levels, as real pages.
 *
 * Overview is not a level you buy — it is the cross-level summary every
 * workspace sees. The other four map one-to-one onto the plan tiers and onto
 * the engine's checks, which is why `requiredPlan` and `kind` sit here rather
 * than being re-derived in each page.
 */
export type LevelKey = "overview" | "compare" | "certify" | "rightsize" | "govern";

export interface LevelMeta {
  key: LevelKey;
  label: string;
  /** Plan a workspace must be paying for. Null for the always-visible overview. */
  requiredPlan: PlanTier | null;
  /** Engine check this level renders, where there is exactly one. */
  kind: RecKind | null;
  tagline: string;
  /** Compact nav badge. Absent on the overview, which is not a purchasable rung. */
  tag?: string;
}

export const LEVELS: LevelMeta[] = [
  {
    key: "overview",
    label: "Overview",
    requiredPlan: null,
    kind: null,
    tagline: "Where you stand across every check.",
  },
  {
    key: "compare",
    label: "Compare",
    requiredPlan: "compare",
    kind: "host_arbitrage",
    tagline:
      "Same model, run through whichever provider charges less for it. Nothing about the output changes. Only who gets paid.",
    tag: "Same model, cheaper host",
  },
  {
    key: "certify",
    label: "Certify",
    requiredPlan: "certify",
    kind: "quality_match",
    tagline:
      "A cheaper model, proven to score the same as what you're running today. 'Certified' means it cleared a benchmark test built to catch the difference. Not just a claim that it's just as good.",
    tag: "Cheaper model, proven equal",
  },
  {
    key: "rightsize",
    label: "Rightsize",
    requiredPlan: "rightsize",
    kind: "rightsize",
    tagline:
      "Matches the model to what the task actually requires. Some tasks are running on far more model than the work needs. Rightsize points those at a model built for that size of problem, not a smaller budget.",
    tag: "Right-fit model for the task",
  },
  {
    key: "govern",
    label: "Govern",
    requiredPlan: "govern",
    kind: null,
    tagline:
      "Everything Compare, Certify, and Rightsize already proved safe, applied automatically. Without you clicking anything. Every switch it runs on its own already cleared the same evidence bar Compare, Certify, and Rightsize use for you.",
    tag: "Proven switches, applied automatically",
  },
];

export const levelMeta = (key: LevelKey) => LEVELS.find((l) => l.key === key)!;

/** Route path for a level in a given workspace scope. */
export function levelPath(scope: DashboardScope, key: LevelKey): string {
  if (scope === "demo") return `/demo/${key}`;
  return key === "overview" ? "/workspace" : `/workspace/${key}`;
}
