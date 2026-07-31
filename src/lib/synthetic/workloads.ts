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
 */
export interface SyntheticWorkload {
  modelKey: string;
  host: string;
  taskHint: string;
  /** Mean requests per day across the whole period, before the traffic curve. */
  requestsPerDay: number;
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
  /** Plain-language description of what this workload is, for the demo UI. */
  label: string;
}

/**
 * Eleven workloads across four vendors and six hosts — the shape of a mid-size
 * AI product's bill: a few expensive reasoning paths, one big coding workload,
 * and two very high-cadence classifier paths that dominate request count but
 * not spend.
 */
export const SYNTHETIC_WORKLOADS: SyntheticWorkload[] = [
  {
    modelKey: "o1-pro",
    host: "api.openai.com",
    taskHint: "generation",
    requestsPerDay: 22,
    inputP50: 5200,
    inputSpread: 2.1,
    outputP50: 2400,
    outputP95: 6100,
    latencyP50Ms: 41200,
    errorRate: 0.012,
    label: "Deep research briefs",
  },
  {
    modelKey: "gpt-5.5",
    host: "api.openai.com",
    taskHint: "generation",
    requestsPerDay: 421,
    inputP50: 3100,
    inputSpread: 1.9,
    outputP50: 1450,
    outputP95: 3600,
    latencyP50Ms: 8600,
    errorRate: 0.006,
    label: "Customer-facing answer composer",
  },
  {
    modelKey: "gpt-4",
    host: "api.openai.com",
    taskHint: "generation",
    requestsPerDay: 216,
    inputP50: 2400,
    inputSpread: 1.7,
    outputP50: 900,
    outputP95: 1500,
    latencyP50Ms: 7400,
    errorRate: 0.009,
    label: "Legacy summarisation path",
  },
  {
    modelKey: "claude-opus-4-5",
    host: "api.anthropic.com",
    taskHint: "generation",
    requestsPerDay: 97,
    inputP50: 6800,
    inputSpread: 2.3,
    outputP50: 1900,
    outputP95: 4800,
    latencyP50Ms: 11900,
    errorRate: 0.005,
    label: "Long-document analysis",
  },
  {
    modelKey: "gpt-5.4",
    host: "api.openai.com",
    taskHint: "generation",
    requestsPerDay: 378,
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
    modelKey: "claude-opus-4-7",
    host: "api.anthropic.com",
    taskHint: "generation",
    requestsPerDay: 69,
    inputP50: 7400,
    inputSpread: 2.2,
    outputP50: 2050,
    outputP95: 5200,
    latencyP50Ms: 12600,
    errorRate: 0.004,
    label: "Escalation handling",
  },
  {
    modelKey: "claude-opus-4-7-fast",
    host: "api.anthropic.com",
    taskHint: "generation",
    requestsPerDay: 133,
    inputP50: 4100,
    inputSpread: 1.9,
    outputP50: 430,
    outputP95: 690,
    latencyP50Ms: 5200,
    errorRate: 0.004,
    label: "Inline assistant",
  },
  {
    modelKey: "qwen3-coder-next",
    host: "dashscope.aliyuncs.com",
    taskHint: "code",
    requestsPerDay: 597,
    inputP50: 4400,
    inputSpread: 2.4,
    outputP50: 820,
    outputP95: 2400,
    latencyP50Ms: 4300,
    errorRate: 0.011,
    label: "Repo-aware code assistant",
  },
  {
    modelKey: "gpt-oss-120b",
    host: "api.deepinfra.com",
    taskHint: "generation",
    requestsPerDay: 921,
    inputP50: 1800,
    inputSpread: 1.8,
    outputP50: 640,
    outputP95: 1500,
    latencyP50Ms: 2900,
    errorRate: 0.014,
    label: "Bulk content rewriting",
  },
  {
    modelKey: "deepseek-v4-flash",
    host: "api.venice.ai",
    taskHint: "classification",
    requestsPerDay: 1426,
    inputP50: 1250,
    inputSpread: 1.6,
    outputP50: 74,
    outputP95: 108,
    latencyP50Ms: 900,
    errorRate: 0.008,
    label: "Ticket triage",
  },
  {
    modelKey: "qwen3-32b",
    host: "api.groq.com",
    taskHint: "classification",
    requestsPerDay: 1740,
    inputP50: 980,
    inputSpread: 1.5,
    outputP50: 61,
    outputP95: 88,
    latencyP50Ms: 480,
    errorRate: 0.007,
    label: "Intent + safety labelling",
  },
];

/** Providers the demo workspace receives invoices from, for reconciliation. */
export const SYNTHETIC_BILLING_PROVIDERS: Record<string, string[]> = {
  openai: ["api.openai.com"],
  anthropic: ["api.anthropic.com"],
  alibaba: ["dashscope.aliyuncs.com"],
  deepinfra: ["api.deepinfra.com"],
  venice: ["api.venice.ai"],
  groq: ["api.groq.com"],
};
