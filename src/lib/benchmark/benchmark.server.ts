import { BENCHMARK_ASK_THRESHOLD, askThresholdMet } from "./ask-gate";
import { candidateCuts, cutLabel, K_ANONYMITY_FLOOR } from "./k-anonymity";


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

export interface SelfCut {
  industry: string | null;
  use_case: string | null;
  revenue_band: string | null;
  granularity: number;
  widened: boolean;
  company_count: number;
  p25_usd: number | null;
  p50_usd: number | null;
  p75_usd: number | null;
}

/**
 * The caller's own cohort, resolved entirely inside the database.
 *
 * There are no free profile parameters: the industry, use case and revenue
 * band come from this workspace's own profile row, and the widening ladder is
 * walked server-side so exactly one cohort — the first that clears the floor —
 * ever comes back. A caller who cannot address a neighbouring cell cannot
 * difference two of them, so the raw-count leak and the percentile-subtraction
 * attack are closed by the same mechanism rather than by two patches.
 */
async function selfCut(client: Client, orgId: string): Promise<SelfCut | null> {
  const { data, error } = await client.rpc("benchmark_cut_self", { _org_id: orgId });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as SelfCut | null;
  return row ?? null;
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

/**
 * Platform-wide pool of benchmark-eligible companies: profiled, real,
 * quality-clean, and sending real traffic. Exactly the population every cohort
 * is drawn from, with no cut applied — so it can be read before knowing this
 * workspace's answers, which is what makes the ask-gate non-circular.
 */
export async function eligibleCompanies(client: Client): Promise<number> {
  const { data, error } = await client.rpc("benchmark_eligible_companies");
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return Number(typeof row === "object" && row !== null ? Object.values(row)[0] : row) || 0;
}

export async function buildBenchmark(
  client: Client,
  profile: ProfileRow | null,
  orgId: string,
): Promise<BenchmarkView> {
  if (!profile) return { state: "no_profile" };
  if (!hasBenchmarkAnswers(profile)) {
    // Dispatch 123. Nothing answered yet: only ask when an answer could
    // plausibly buy a comparison. Once answers exist we never come back here,
    // so this can never turn into a re-prompt or a withdrawal of the ask.
    const eligible = await eligibleCompanies(client);
    if (!askThresholdMet(eligible)) {
      return { state: "too_early", eligibleCompanies: eligible, threshold: BENCHMARK_ASK_THRESHOLD };
    }
    return { state: "locked", industry: profile.industry, useCase: profile.use_case };
  }


  // No dimensions at all means there is nothing to cut on, and the database
  // is never asked.
  const dims = candidateCuts({
    industry: profile.industry,
    useCase: profile.use_case,
    revenueBand: profile.revenue_band,
  });
  if (dims.length === 0) {
    return { state: "refused", floor: K_ANONYMITY_FLOOR, reason: "no_dimensions" };
  }

  const cut = await selfCut(client, orgId);
  if (
    !cut ||
    cut.company_count < K_ANONYMITY_FLOOR ||
    cut.p25_usd === null ||
    cut.p50_usd === null ||
    cut.p75_usd === null
  ) {
    return { state: "refused", floor: K_ANONYMITY_FLOOR, reason: "below_floor" };
  }

  const yours = await ownMonthlySpend(client, orgId);
  const position = yours < cut.p25_usd ? "below" : yours > cut.p75_usd ? "above" : "typical";

  return {
    state: "shown",
    cohortLabel: cutLabel({
      industry: cut.industry,
      useCase: cut.use_case,
      revenueBand: cut.revenue_band,
    }),
    companyCount: cut.company_count,
    widened: cut.widened,
    lowUsd: Number(cut.p25_usd),
    medianUsd: Number(cut.p50_usd),
    highUsd: Number(cut.p75_usd),
    yourMonthlyUsd: Math.round(yours * 100) / 100,
    position,
  };
}
