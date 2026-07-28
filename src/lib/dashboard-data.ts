export type SwitchKind = "host" | "quality";

export interface SwitchRow {
  fromModel: string;
  fromHost: string;
  toModel: string;
  toHost: string;
  kind: SwitchKind;
  monthlySaving: number;
  savingPct: number;
}

export interface ActiveSwitch {
  fromModel: string;
  fromHost: string;
  toModel: string;
  toHost: string;
  badge: "Proven switch" | "Equal-quality switch";
  basis: string;
  since: string;
  saved: number;
}

export interface Overpowered {
  model: string;
  host: string;
  task: string;
  tier: string;
  note: string;
  wasted: number;
}

export const gatewaySpend = {
  tracked: 2300,
  requests: 99944,
  tokens: "594M",
  excludedModels: 3,
  syncedAgo: "1d ago",
};

export const kpis = {
  activeSaving: 331.36,
  activeSwitches: 2,
  availableSaving: 600.89,
  certifiedSwitches: 9,
  frozen: 0,
};

/** Daily gateway spend, last 30 days (USD). */
export const spendSeries: { date: string; spend: number }[] = [
  { date: "06-26", spend: 92 },
  { date: "06-27", spend: 96 },
  { date: "06-28", spend: 88 },
  { date: "06-29", spend: 101 },
  { date: "06-30", spend: 90 },
  { date: "07-01", spend: 54 },
  { date: "07-02", spend: 41 },
  { date: "07-03", spend: 98 },
  { date: "07-04", spend: 99 },
  { date: "07-05", spend: 85 },
  { date: "07-06", spend: 84 },
  { date: "07-07", spend: 87 },
  { date: "07-08", spend: 52 },
  { date: "07-09", spend: 48 },
  { date: "07-10", spend: 95 },
  { date: "07-11", spend: 97 },
  { date: "07-12", spend: 91 },
  { date: "07-13", spend: 89 },
  { date: "07-14", spend: 93 },
  { date: "07-15", spend: 55 },
  { date: "07-16", spend: 46 },
  { date: "07-17", spend: 96 },
  { date: "07-18", spend: 100 },
  { date: "07-19", spend: 94 },
  { date: "07-20", spend: 92 },
  { date: "07-21", spend: 97 },
  { date: "07-22", spend: 50 },
  { date: "07-23", spend: 44 },
  { date: "07-24", spend: 99 },
  { date: "07-25", spend: 103 },
];

export const pipeline = [
  {
    step: 1,
    title: "Host Arbitrage Check",
    detail: "Same model, cheaper host",
    value: 7,
    unit: "workloads certified",
    tone: "saving" as const,
  },
  {
    step: 2,
    title: "Quality Check",
    detail: "4 certified · 8 refused",
    value: 12,
    unit: "workloads evaluated",
    tone: "saving" as const,
  },
  {
    step: 3,
    title: "Right-Size Check",
    detail: "Premium models on low-complexity tasks",
    value: 2,
    unit: "workloads flagged",
    tone: "opportunity" as const,
  },
  {
    step: 4,
    title: "Manual Switch",
    detail: "Rerouting traffic right now",
    value: 2,
    unit: "active switches",
    tone: "spend" as const,
  },
];

export const cheaperHost: SwitchRow[] = [
  {
    fromModel: "gpt-5.5",
    fromHost: "api.openai.com",
    toModel: "gpt-5.5",
    toHost: "azure",
    kind: "host",
    monthlySaving: 148.2,
    savingPct: 31,
  },
  {
    fromModel: "gpt-5.4",
    fromHost: "api.openai.com",
    toModel: "gpt-5.4",
    toHost: "azure",
    kind: "host",
    monthlySaving: 121.5,
    savingPct: 28,
  },
  {
    fromModel: "qwen3-coder-next",
    fromHost: "dashscope.aliyuncs.com",
    toModel: "qwen3-coder-next",
    toHost: "ionstream",
    kind: "host",
    monthlySaving: 76.4,
    savingPct: 44,
  },
  {
    fromModel: "gpt-oss-120b",
    fromHost: "api.deepinfra.com",
    toModel: "gpt-oss-120b",
    toHost: "wandb",
    kind: "host",
    monthlySaving: 58.9,
    savingPct: 22,
  },
  {
    fromModel: "deepseek-v4-flash",
    fromHost: "api.venice.ai",
    toModel: "deepseek-v4-flash",
    toHost: "alibaba",
    kind: "host",
    monthlySaving: 41.3,
    savingPct: 19,
  },
  {
    fromModel: "qwen3-32b",
    fromHost: "api.groq.com",
    toModel: "qwen3-32b",
    toHost: "alibaba",
    kind: "host",
    monthlySaving: 33.1,
    savingPct: 17,
  },
];

export const qualityMatched: SwitchRow[] = [
  {
    fromModel: "claude-opus-4-7-fast",
    fromHost: "api.anthropic.com",
    toModel: "gpt-5-6-sol",
    toHost: "openai",
    kind: "quality",
    monthlySaving: 52.6,
    savingPct: 61,
  },
  {
    fromModel: "claude-opus-4-5",
    fromHost: "api.anthropic.com",
    toModel: "gpt-5-6-terra",
    toHost: "openai",
    kind: "quality",
    monthlySaving: 39.8,
    savingPct: 54,
  },
  {
    fromModel: "claude-opus-4-7",
    fromHost: "api.anthropic.com",
    toModel: "gpt-5-6-terra",
    toHost: "openai",
    kind: "quality",
    monthlySaving: 29.1,
    savingPct: 47,
  },
];

export const overpowered: Overpowered[] = [
  {
    model: "o1-pro",
    host: "api.openai.com",
    task: "generation",
    tier: "Frontier",
    note: "Frontier-tier model on a generation task — a standard or economy tier covers this workload.",
    wasted: 214,
  },
  {
    model: "gpt-4",
    host: "api.openai.com",
    task: "generation",
    tier: "Frontier",
    note: "Frontier-tier model on a generation task — a standard or economy tier covers this workload.",
    wasted: 96,
  },
];

export const activeSwitches: ActiveSwitch[] = [
  {
    fromModel: "o1",
    fromHost: "api.openai.com",
    toModel: "gpt-oss-120b",
    toHost: "api.deepinfra.com",
    badge: "Proven switch",
    basis: "Quality-matched",
    since: "27/07/2026",
    saved: 212.4,
  },
  {
    fromModel: "llama-3.3-70b-instruct",
    fromHost: "api.together.xyz",
    toModel: "llama-3.3-70b-instruct",
    toHost: "api.deepinfra.com",
    badge: "Equal-quality switch",
    basis: "Same model, cheaper host",
    since: "18/07/2026",
    saved: 118.96,
  },
];

export const usd = (n: number, digits = 2) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
