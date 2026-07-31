import { costOf, DAYS_IN_MONTH, round2 } from "@/lib/engine/cost";
import { requiredTierFor, shapeOf, TIER_RANK } from "@/lib/engine/rightsize";
import type { ModelRow, ModelTier, PriceRow, UsageAggregate } from "@/lib/engine/types";

import type { RollupRow } from "./generator";
import { SYNTHETIC_BILLING_PROVIDERS } from "./workloads";

/** Collapse rollups into one aggregate per workload, exactly as the pipeline does. */
export function aggregateRollups(rows: RollupRow[], days: number): UsageAggregate[] {
  const byWorkload = new Map<string, UsageAggregate & { _p50: number[]; _p95: number[] }>();
  for (const r of rows) {
    const key = `${r.modelKey}|${r.host}|${r.taskHint}`;
    const existing =
      byWorkload.get(key) ??
      ({
        model_key: r.modelKey,
        host: r.host,
        task_hint: r.taskHint,
        requests: 0,
        input_tokens: 0,
        output_tokens: 0,
        cost_usd: 0,
        days,
        _p50: [],
        _p95: [],
      } as UsageAggregate & { _p50: number[]; _p95: number[] });
    existing.requests += r.requests;
    existing.input_tokens += r.inputTokens;
    existing.output_tokens += r.outputTokens;
    existing.cost_usd += r.costUsd;
    if (r.outputP50 > 0) existing._p50.push(r.outputP50);
    if (r.outputP95 > 0) existing._p95.push(r.outputP95);
    byWorkload.set(key, existing);
  }

  return [...byWorkload.values()].map(({ _p50, _p95, ...u }) => ({
    ...u,
    // Median of the bucket medians: robust to a single quiet bucket.
    output_p50: median(_p50),
    output_p95: median(_p95),
  }));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

export interface WorkloadProfileRow {
  modelKey: string;
  host: string;
  taskHint: string;
  avgInputTokens: number;
  avgOutputTokens: number;
  complexityScore: number;
  requiredTier: ModelTier;
  observedTier: ModelTier;
  monthlyCostUsd: number;
}

/**
 * Complexity, 0-1, from observed shape alone: how long the responses are, how
 * much they vary, and how much context the task carries. This is the number the
 * rightsize verdict is explained with — it is never a proxy for content.
 */
export function complexityScore(u: UsageAggregate): number {
  const s = shapeOf(u);
  const length = clamp01(Math.log10(Math.max(s.avgOutputTokens, 1)) / 3.7);
  const variability = clamp01((s.dispersion - 1) / 2.5);
  const context = clamp01(Math.log10(Math.max(s.avgInputTokens, 1)) / 5);
  return round2(0.5 * length + 0.3 * variability + 0.2 * context);
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export function buildProfiles(
  usage: UsageAggregate[],
  models: ModelRow[],
  priceFor: (modelKey: string, host: string) => PriceRow | undefined,
): WorkloadProfileRow[] {
  const tierOf = new Map(models.map((m) => [m.model_key, m.tier]));
  return usage
    .map((u) => {
      const price = priceFor(u.model_key, u.host);
      const observedTier = tierOf.get(u.model_key) ?? "standard";
      const monthly = price ? (costOf(price, u.input_tokens, u.output_tokens) / u.days) * DAYS_IN_MONTH : 0;
      return {
        modelKey: u.model_key,
        host: u.host,
        taskHint: u.task_hint,
        avgInputTokens: Math.round(u.input_tokens / Math.max(u.requests, 1)),
        avgOutputTokens: Math.round(u.output_tokens / Math.max(u.requests, 1)),
        complexityScore: complexityScore(u),
        requiredTier: requiredTierFor(u),
        observedTier,
        monthlyCostUsd: round2(monthly),
      };
    })
    .sort((a, b) => b.monthlyCostUsd - a.monthlyCostUsd);
}

/** Workloads running on a tier above what their shape needs. */
export function oversizedProfiles(profiles: WorkloadProfileRow[]): WorkloadProfileRow[] {
  return profiles.filter((p) => TIER_RANK[p.observedTier] > TIER_RANK[p.requiredTier]);
}

export interface BillingPair {
  provider: string;
  periodStart: string;
  periodEnd: string;
  estimatedUsd: number;
  invoicedUsd: number;
  deltaUsd: number;
  deltaPct: number;
  verdict: "match" | "under_estimated" | "over_estimated";
  note: string;
  idempotencyKey: string;
}

/** Anything inside this band is measurement noise, not a pricing disagreement. */
export const RECONCILIATION_TOLERANCE_PCT = 2;

/**
 * Estimated (what CostMyAI priced from metadata) versus invoiced (what the
 * provider actually charged). The gap is the honest part: cached prompts,
 * minimum billing units and rounding mean the two never match exactly, and a
 * demo that showed a perfect match would be lying about how billing works.
 */
export function buildBilling(
  rows: RollupRow[],
  periodStart: Date,
  periodEnd: Date,
  drift: Record<string, number>,
): BillingPair[] {
  const hostToProvider = new Map<string, string>();
  for (const [provider, hosts] of Object.entries(SYNTHETIC_BILLING_PROVIDERS)) {
    for (const host of hosts) hostToProvider.set(host, provider);
  }

  const estimated = new Map<string, number>();
  for (const r of rows) {
    const provider = hostToProvider.get(r.host);
    if (!provider) continue;
    estimated.set(provider, (estimated.get(provider) ?? 0) + r.costUsd);
  }

  const startIso = periodStart.toISOString().slice(0, 10);
  const endIso = periodEnd.toISOString().slice(0, 10);

  return [...estimated.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([provider, est]) => {
      const invoiced = round2(est * (1 + (drift[provider] ?? 0)));
      const estimatedUsd = round2(est);
      const deltaUsd = round2(invoiced - estimatedUsd);
      const deltaPct = estimatedUsd === 0 ? 0 : round2((deltaUsd / estimatedUsd) * 100);
      const verdict =
        Math.abs(deltaPct) <= RECONCILIATION_TOLERANCE_PCT
          ? "match"
          : deltaUsd > 0
            ? "under_estimated"
            : "over_estimated";
      return {
        provider,
        periodStart: startIso,
        periodEnd: endIso,
        estimatedUsd,
        invoicedUsd: invoiced,
        deltaUsd,
        deltaPct,
        verdict,
        note:
          verdict === "match"
            ? `Within the ±${RECONCILIATION_TOLERANCE_PCT}% tolerance band.`
            : verdict === "under_estimated"
              ? "Invoice above metadata estimate — typically minimum billing units or untracked retries."
              : "Invoice below metadata estimate — typically prompt caching or committed-use discounts.",
        idempotencyKey: `synthetic:${provider}:${startIso}:${endIso}`,
      };
    });
}
