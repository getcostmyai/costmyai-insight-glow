import { BENCHMARK_ASK_THRESHOLD, askThresholdMet } from "./ask-gate";
import { resolveBucket, type BucketResolution, type Cut } from "./k-anonymity";


/**
 * Benchmark resolution against real workspaces.
 *
 * Two rules govern everything here. A figure is only ever computed from cuts
 * that clear the k-anonymity floor (enforced in `k-anonymity.ts`, and again in
 * the database function, which returns NULL spread below the floor). And when
 * no cut clears it, the answer is an explicit refusal — never a wider guess
 * dressed up as a comparison.
 */

export interface ProfileRow {
  org_id: string;
  use_case: string;
  use_case_other: string | null;
  industry: string;
  revenue_band: string | null;
  headcount_band: string | null;
  customer_facing: boolean | null;
  maturity: string | null;
  quality_flag: string | null;
  primer_seen_at: string | null;
  benchmark_prompt_dismissed_at: string | null;
}

export type BenchmarkView =
  | { state: "no_profile" }
  /**
   * Dispatch 123. Too few companies are connected platform-wide for any cohort
   * to clear the floor, so the four questions are not asked yet. Distinct from
   * "refused": nobody has answered anything and nothing was evaluated.
   */
  | { state: "too_early"; eligibleCompanies: number; threshold: number }
  /** Signup answers only: we know the shape of the answer, not the answer. */
  | { state: "locked"; industry: string; useCase: string }
  | {
      state: "shown";
      cohortLabel: string;
      companyCount: number;
      widened: boolean;
      lowUsd: number;
      medianUsd: number;
      highUsd: number;
      yourMonthlyUsd: number;
      position: "below" | "typical" | "above";
    }
  | { state: "refused"; floor: number; reason: "no_dimensions" | "below_floor" };


type Client = {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
};

export function hasBenchmarkAnswers(p: ProfileRow | null): boolean {
  if (!p) return false;
  return (
    p.revenue_band !== null ||
    p.headcount_band !== null ||
    p.customer_facing !== null ||
    p.maturity !== null
  );
}

async function countFor(client: Client, cut: Cut): Promise<number> {
  const { data, error } = await client.rpc("benchmark_cut", {
    _industry: cut.industry,
    _use_case: cut.useCase,
    _revenue_band: cut.revenueBand,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return Number((row as { company_count?: number } | null)?.company_count ?? 0);
}

async function spreadFor(client: Client, cut: Cut) {
  const { data, error } = await client.rpc("benchmark_cut", {
    _industry: cut.industry,
    _use_case: cut.useCase,
    _revenue_band: cut.revenueBand,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as {
    p25_usd: number | null;
    p50_usd: number | null;
    p75_usd: number | null;
  } | null;
  return row;
}

/**
 * Own 30-day spend, read through the caller's own RLS-scoped client.
 *
 * The synthetic filter is not optional and not cosmetic: `benchmark_cut`
 * builds the cohort from real rows only, so counting demo traffic on this side
 * would compare a padded "you" against an unpadded "them" and tell a workspace
 * it overspends purely because it has seeded data. Both sides of a comparison
 * have to be the same measurement.
 */
export async function ownMonthlySpend(client: Client, orgId: string): Promise<number> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data, error } = await client
    .from("usage_rollups")
    .select("cost_usd")
    .eq("org_id", orgId)
    .eq("granularity", "day")
    .eq("is_synthetic", false)
    .gte("bucket_start", since);
  if (error) throw error;
  return (data ?? []).reduce((s: number, r: { cost_usd: number }) => s + Number(r.cost_usd), 0);
}

export async function buildBenchmark(
  client: Client,
  profile: ProfileRow | null,
  orgId: string,
): Promise<BenchmarkView> {
  if (!profile) return { state: "no_profile" };
  if (!hasBenchmarkAnswers(profile)) {
    return { state: "locked", industry: profile.industry, useCase: profile.use_case };
  }

  const resolution: BucketResolution = await resolveBucket(
    {
      industry: profile.industry,
      useCase: profile.use_case,
      revenueBand: profile.revenue_band,
    },
    (cut) => countFor(client, cut),
  );

  if (!resolution.ok) {
    return { state: "refused", floor: resolution.floor, reason: resolution.reason };
  }

  const spread = await spreadFor(client, resolution.cut);
  // Belt and braces: the database withholds the spread below the floor, so a
  // missing spread is itself a refusal rather than something to paper over.
  if (!spread || spread.p25_usd === null || spread.p50_usd === null || spread.p75_usd === null) {
    return { state: "refused", floor: resolution.floor, reason: "below_floor" };
  }

  const yours = await ownMonthlySpend(client, orgId);
  const position = yours < spread.p25_usd ? "below" : yours > spread.p75_usd ? "above" : "typical";

  return {
    state: "shown",
    cohortLabel: resolution.cut.label,
    companyCount: resolution.companyCount,
    widened: resolution.widened,
    lowUsd: Number(spread.p25_usd),
    medianUsd: Number(spread.p50_usd),
    highUsd: Number(spread.p75_usd),
    yourMonthlyUsd: Math.round(yours * 100) / 100,
    position,
  };
}
