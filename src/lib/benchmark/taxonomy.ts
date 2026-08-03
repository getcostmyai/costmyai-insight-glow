/**
 * The fixed vocabulary behind every benchmark cut.
 *
 * All of it is a closed list on purpose. Free text cannot be bucketed cleanly,
 * and a bucket nobody can reproduce is a number nobody can defend — the same
 * "prove it or refuse it" rule the rest of the product runs on.
 */

export const USE_CASES = [
  { key: "customer_facing", label: "Customer-facing product feature", hint: "chat, generation or anything your end users touch" },
  { key: "internal", label: "Internal engineering or productivity tool", hint: "used by your own team only" },
  { key: "both", label: "Both", hint: "customer-facing and internal workloads" },
  { key: "other", label: "Something else", hint: "tell us in a word — kept out of benchmark buckets" },
] as const;

export type UseCase = (typeof USE_CASES)[number]["key"];

/** "other" is unstructured, so it never takes part in a bucket. */
export const BUCKETABLE_USE_CASES: UseCase[] = ["customer_facing", "internal", "both"];

export const INDUSTRIES = [
  "SaaS / software",
  "E-commerce / retail",
  "Financial services",
  "Healthcare / life sciences",
  "Media / marketing",
  "Education",
  "Logistics / manufacturing",
  "Professional services",
  "Public sector",
  "Other",
] as const;

export type Industry = (typeof INDUSTRIES)[number];

export const REVENUE_BANDS = [
  { key: "pre_revenue", label: "Pre-revenue" },
  { key: "lt_1m", label: "Under $1M" },
  { key: "1m_10m", label: "$1M – $10M" },
  { key: "10m_50m", label: "$10M – $50M" },
  { key: "50m_250m", label: "$50M – $250M" },
  { key: "gt_250m", label: "Over $250M" },
] as const;

export type RevenueBand = (typeof REVENUE_BANDS)[number]["key"];

export const HEADCOUNT_BANDS = [
  { key: "1_9", label: "1 – 9" },
  { key: "10_49", label: "10 – 49" },
  { key: "50_249", label: "50 – 249" },
  { key: "250_999", label: "250 – 999" },
  { key: "1000_plus", label: "1,000+" },
] as const;

export type HeadcountBand = (typeof HEADCOUNT_BANDS)[number]["key"];

export const MATURITIES = [
  { key: "pilot", label: "Pilot / experimenting", hint: "a few workloads, still proving it out" },
  { key: "production", label: "Production at scale", hint: "real traffic depends on it" },
] as const;

export type Maturity = (typeof MATURITIES)[number]["key"];

export const isUseCase = (v: unknown): v is UseCase => USE_CASES.some((u) => u.key === v);
export const isIndustry = (v: unknown): v is Industry => (INDUSTRIES as readonly string[]).includes(v as string);
export const isRevenueBand = (v: unknown): v is RevenueBand => REVENUE_BANDS.some((r) => r.key === v);
export const isHeadcountBand = (v: unknown): v is HeadcountBand => HEADCOUNT_BANDS.some((h) => h.key === v);
export const isMaturity = (v: unknown): v is Maturity => MATURITIES.some((m) => m.key === v);

export const labelFor = {
  useCase: (k: string) => USE_CASES.find((u) => u.key === k)?.label ?? k,
  revenue: (k: string) => REVENUE_BANDS.find((r) => r.key === k)?.label ?? k,
  headcount: (k: string) => HEADCOUNT_BANDS.find((h) => h.key === k)?.label ?? k,
  maturity: (k: string) => MATURITIES.find((m) => m.key === k)?.label ?? k,
};
