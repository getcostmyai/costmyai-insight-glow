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
    tagline: "Same model, cheaper host.",
  },
  {
    key: "certify",
    label: "Certify",
    requiredPlan: "certify",
    kind: "quality_match",
    tagline: "Cheaper model, same measured quality.",
  },
  {
    key: "rightsize",
    label: "Rightsize",
    requiredPlan: "rightsize",
    kind: "rightsize",
    tagline: "Oversized models, switched by you.",
  },
  {
    key: "govern",
    label: "Govern",
    requiredPlan: "govern",
    kind: null,
    tagline: "Certified switches, applied unattended.",
  },
];

export const levelMeta = (key: LevelKey) => LEVELS.find((l) => l.key === key)!;

/** Route path for a level in a given workspace scope. */
export function levelPath(scope: DashboardScope, key: LevelKey): string {
  if (scope === "demo") return `/demo/${key}`;
  return key === "overview" ? "/workspace" : `/workspace/${key}`;
}
