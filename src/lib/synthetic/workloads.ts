/**
 * The synthetic ecosystem.
 *
 * Every row this produces is flagged `is_synthetic` at the database level and
 * belongs to the demo workspace. It exists so the product can be demonstrated,
 * and the engine exercised end to end, without a single real customer request.
 * It is never mixed into a live workspace's numbers.
 *
 * Shapes only — request cadence, token counts, response-length spread, latency.
 * There is no prompt text here because there is no prompt text anywhere in
 * CostMyAI: the middleware pushes metadata, never content.
 *
 * Note what a workload does NOT declare: a request rate. Volume is derived in
 * `sizing.ts` from each model's live synced price, so an expensive model needs
 * very few calls to matter and a cheap one needs proportionally far more —
 * which is exactly how a real bill is distributed.
 */
export interface SyntheticWorkload {
  modelKey: string;
  host: string;
  taskHint: string;
  /**
   * Share of total ecosystem spend this workload accounts for. Shares sum to 1
   * and are deliberately concentrated: a handful of frontier paths carry most
   * of the bill while the highest-request-count workloads barely register.
   */
  spendShare: number;
  /** Median prompt length. */
  inputP50: number;
  /** p95/p50 for prompt length. */
  inputSpread: number;
  /** Median response length. */
  outputP50: number;
  /** p95 response length — the dispersion the rightsize check reads. */
  outputP95: number;
  /** Median end-to-end latency for this model/host pair. */
  latencyP50Ms: number;
  /** Fraction of requests that fail upstream. Failed calls still cost input tokens. */
  errorRate: number;
  /**
   * Lifecycle. A real ecosystem is never static: teams adopt newly released
   * models and retire the paths that stop earning their cost. Both movements
   * ramp over roughly a week rather than switching on and off, so the engine
   * sees a workload that is genuinely growing or genuinely draining.
   */
  lifecycle?: {
    /** Days before "now" that this workload first appeared. */
    introducedDaysAgo?: number;
    /** Days before "now" that this workload started being phased out. */
    retiringSinceDaysAgo?: number;
    /** Length of the ramp, in days. */
    rampDays?: number;
  };
  /** Plain-language description of what this workload is, for the demo UI. */
  label: string;
}

export const DEFAULT_RAMP_DAYS = 7;

/**
 * How present a workload is at a given moment, 0 (absent) to 1 (fully ramped).
 * `daysAgo` is measured back from the end of the window.
 */
export function lifecycleFactor(daysAgo: number, workload: SyntheticWorkload): number {
  const lc = workload.lifecycle;
  if (!lc) return 1;
  const ramp = Math.max(lc.rampDays ?? DEFAULT_RAMP_DAYS, 0.5);
  let factor = 1;

  if (lc.introducedDaysAgo !== undefined) {
    // Nothing before adoption, then a week-long ramp to steady state.
    factor *= clamp01((lc.introducedDaysAgo - daysAgo) / ramp);
  }
  if (lc.retiringSinceDaysAgo !== undefined) {
    factor *= 1 - clamp01((lc.retiringSinceDaysAgo - daysAgo) / ramp);
  }
  return factor;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * Thirteen workloads across five vendors and eight hosts — the shape of a
 * mid-size AI product's bill: a few expensive reasoning paths carrying most of
 * the spend, one big coding workload, two very high-cadence classifier paths
 * that dominate request count but not cost, two newly adopted models ramping
 * up, and two legacy paths draining away.
 */
export const SYNTHETIC_WORKLOADS: SyntheticWorkload[] = [
  {
    modelKey: "anthropic/claude-opus-4.7",
    host: "azure",
    taskHint: "generation",
    spendShare: 0.18,
    inputP50: 7400,
    inputSpread: 2.2,
    outputP50: 2050,
    outputP95: 5200,
    latencyP50Ms: 12600,
    errorRate: 0.004,
    label: "Escalation handling",
  },
  {
    modelKey: "anthropic/claude-opus-4.5",
    host: "anthropic",
    taskHint: "generation",
    spendShare: 0.16,
    inputP50: 6800,
    inputSpread: 2.3,
    outputP50: 1900,
    outputP95: 4800,
    latencyP50Ms: 11900,
    errorRate: 0.005,
    label: "Long-document analysis",
  },
  {
    modelKey: "openai/gpt-5.5",
    host: "azure",
    taskHint: "generation",
    spendShare: 0.14,
    inputP50: 3100,
    inputSpread: 1.9,
    outputP50: 1450,
    outputP95: 3600,
    latencyP50Ms: 8600,
    errorRate: 0.006,
    label: "Customer-facing answer composer",
  },
  {
    modelKey: "openai/o1-pro",
    host: "openai",
    taskHint: "generation",
    spendShare: 0.1,
    inputP50: 5200,
    inputSpread: 2.1,
    outputP50: 2400,
    outputP95: 6100,
    latencyP50Ms: 41200,
    errorRate: 0.012,
    // Being wound down after the cost review — still running, visibly draining.
    lifecycle: { retiringSinceDaysAgo: 9 },
    label: "Deep research briefs (winding down)",
  },
  {
    modelKey: "openai/gpt-5.4",
    host: "azure",
    taskHint: "generation",
    spendShare: 0.09,
    inputP50: 2900,
    inputSpread: 1.8,
    // Templated drafting: long-ish but highly uniform output. This is what an
    // oversized workload actually looks like in the wild — a frontier model
    // doing fill-in-the-blanks work.
    outputP50: 1240,
    outputP95: 1520,
    latencyP50Ms: 7100,
    errorRate: 0.006,
    label: "In-product drafting (templated)",
  },
  {
    modelKey: "qwen/qwen3-coder-next",
    host: "alibaba",
    taskHint: "code",
    spendShare: 0.08,
    inputP50: 4400,
    inputSpread: 2.4,
    outputP50: 820,
    outputP95: 2400,
    latencyP50Ms: 4300,
    errorRate: 0.011,
    label: "Repo-aware code assistant",
  },
  {
    modelKey: "anthropic/claude-opus-4.7-fast",
    host: "anthropic",
    taskHint: "generation",
    spendShare: 0.07,
    inputP50: 4100,
    inputSpread: 1.9,
    outputP50: 430,
    outputP95: 690,
    latencyP50Ms: 5200,
    errorRate: 0.004,
    label: "Inline assistant",
  },
  {
    modelKey: "openai/gpt-4",
    host: "azure",
    taskHint: "generation",
    spendShare: 0.06,
    inputP50: 2400,
    inputSpread: 1.7,
    outputP50: 900,
    outputP95: 1500,
    latencyP50Ms: 7400,
    errorRate: 0.009,
    lifecycle: { retiringSinceDaysAgo: 5 },
    label: "Legacy summarisation path (retiring)",
  },
  {
    modelKey: "openai/gpt-5.6-terra",
    host: "azure",
    taskHint: "generation",
    spendShare: 0.05,
    inputP50: 5600,
    inputSpread: 2.2,
    outputP50: 1350,
    outputP95: 3900,
    latencyP50Ms: 6200,
    errorRate: 0.007,
    // Newly released model, adopted mid-window and ramping into production.
    lifecycle: { introducedDaysAgo: 11 },
    label: "Agent planner (new rollout)",
  },
  {
    modelKey: "openai/gpt-oss-120b",
    host: "groq",
    taskHint: "generation",
    spendShare: 0.03,
    inputP50: 1800,
    inputSpread: 1.8,
    outputP50: 640,
    outputP95: 1500,
    latencyP50Ms: 2900,
    errorRate: 0.014,
    label: "Bulk content rewriting",
  },
  {
    modelKey: "deepseek/deepseek-v4-flash",
    host: "venice",
    taskHint: "classification",
    spendShare: 0.02,
    inputP50: 1250,
    inputSpread: 1.6,
    outputP50: 74,
    outputP95: 108,
    latencyP50Ms: 900,
    errorRate: 0.008,
    label: "Ticket triage",
  },
  {
    modelKey: "qwen/qwen3-32b",
    host: "groq",
    taskHint: "classification",
    spendShare: 0.015,
    inputP50: 980,
    inputSpread: 1.5,
    outputP50: 61,
    outputP95: 88,
    latencyP50Ms: 480,
    errorRate: 0.007,
    label: "Intent + safety labelling",
  },
  {
    modelKey: "openai/gpt-5.6-luna",
    host: "azure",
    taskHint: "classification",
    spendShare: 0.005,
    inputP50: 860,
    inputSpread: 1.5,
    outputP50: 48,
    outputP95: 72,
    latencyP50Ms: 610,
    errorRate: 0.006,
    lifecycle: { introducedDaysAgo: 6 },
    label: "Realtime moderation (new rollout)",
  },
];

/**
 * Providers the demo workspace receives invoices from, for reconciliation.
 * Keyed by the host slugs the price importer publishes, because an invoice is
 * reconciled against the host that actually served the traffic — Azure bills
 * for an OpenAI model, and attributing that to OpenAI would compare a bill to
 * spend that never went through it.
 */
export const SYNTHETIC_BILLING_PROVIDERS: Record<string, string[]> = {
  openai: ["openai"],
  azure: ["azure"],
  anthropic: ["anthropic"],
  alibaba: ["alibaba"],
  groq: ["groq"],
  venice: ["venice"],
};

