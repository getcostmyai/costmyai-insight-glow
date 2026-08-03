import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import type { BenchmarkView, ProfileRow } from "./benchmark/benchmark.server";
import { checkAnswers } from "./benchmark/sanity";
import {
  isHeadcountBand,
  isMaturity,
  isRevenueBand,
  type HeadcountBand,
  type Maturity,
  type RevenueBand,
} from "./benchmark/taxonomy";

/**
 * Company profiling, read and written through the caller's own RLS-scoped
 * client. Nothing here is required to use the product: every field beyond the
 * two asked at signup is optional, and skipping all of them costs the user
 * nothing except the benchmark comparison itself.
 */

export interface ProfileState {
  orgId: string;
  profile: {
    useCase: string;
    industry: string;
    revenueBand: string | null;
    headcountBand: string | null;
    customerFacing: boolean | null;
    maturity: string | null;
    primerSeen: boolean;
    promptDismissed: boolean;
  } | null;
  /** Real connected traffic exists — the moment the benchmark ask is earned. */
  hasUsage: boolean;
  benchmark: BenchmarkView;
}

async function resolveOrg(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase
    .from("memberships")
    .select("org_id, created_at")
    .eq("user_id", context.userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("NO_WORKSPACE");
  return data.org_id as string;
}

async function readProfile(supabase: any, orgId: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from("org_profiles")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  return (data as ProfileRow | null) ?? null;
}

async function stateFor(supabase: any, orgId: string): Promise<ProfileState> {
  const { buildBenchmark } = await import("./benchmark/benchmark.server");
  const profile = await readProfile(supabase, orgId);

  const usage = await supabase
    .from("usage_rollups")
    .select("id")
    .eq("org_id", orgId)
    .limit(1);
  if (usage.error) throw usage.error;

  const benchmark = await buildBenchmark(supabase, profile, orgId);

  return {
    orgId,
    profile: profile
      ? {
          useCase: profile.use_case,
          industry: profile.industry,
          revenueBand: profile.revenue_band,
          headcountBand: profile.headcount_band,
          customerFacing: profile.customer_facing,
          maturity: profile.maturity,
          primerSeen: profile.primer_seen_at !== null,
          promptDismissed: profile.benchmark_prompt_dismissed_at !== null,
        }
      : null,
    hasUsage: (usage.data ?? []).length > 0,
    benchmark,
  };
}

export const getProfileState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProfileState> => {
    const orgId = await resolveOrg(context as never);
    return stateFor(context.supabase, orgId);
  });

/**
 * The progressive ask. Every field is individually optional: a user can answer
 * one and skip three, and whatever they answered still counts toward the cut.
 */
export const saveBenchmarkAnswers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      revenueBand?: string | null;
      headcountBand?: string | null;
      customerFacing?: boolean | null;
      maturity?: string | null;
    }) => ({
      revenueBand: isRevenueBand(data?.revenueBand) ? (data.revenueBand as RevenueBand) : null,
      headcountBand: isHeadcountBand(data?.headcountBand)
        ? (data.headcountBand as HeadcountBand)
        : null,
      customerFacing: typeof data?.customerFacing === "boolean" ? data.customerFacing : null,
      maturity: isMaturity(data?.maturity) ? (data.maturity as Maturity) : null,
    }),
  )
  .handler(async ({ context, data }): Promise<ProfileState & { warning: string | null }> => {
    const orgId = await resolveOrg(context as never);
    const existing = await readProfile(context.supabase, orgId);
    if (!existing) throw new Error("This workspace has no profile yet.");

    const verdict = checkAnswers({
      revenueBand: data.revenueBand,
      headcountBand: data.headcountBand,
      customerFacing: data.customerFacing,
      maturity: data.maturity,
      useCase: existing.use_case as never,
    });

    const { error } = await context.supabase
      .from("org_profiles")
      .update({
        revenue_band: data.revenueBand,
        headcount_band: data.headcountBand,
        customer_facing: data.customerFacing,
        maturity: data.maturity,
        // An answer nobody double-checked never joins a bucket other people's
        // numbers are drawn from. The user keeps their own view either way.
        quality_flag: verdict.flag,
        benchmark_prompt_dismissed_at: new Date().toISOString(),
      })
      .eq("org_id", orgId);
    if (error) throw error;

    const state = await stateFor(context.supabase, orgId);
    return { ...state, warning: verdict.warning };
  });

/** Step 2 and the standing invitation: both are just "stop showing me this". */
export const acknowledgeBenchmarkNotice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { what: "primer" | "prompt" }) => ({
    what: data?.what === "prompt" ? ("prompt" as const) : ("primer" as const),
  }))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrg(context as never);
    const patch =
      data.what === "primer"
        ? { primer_seen_at: new Date().toISOString() }
        : { benchmark_prompt_dismissed_at: new Date().toISOString() };
    const { error } = await context.supabase.from("org_profiles").update(patch).eq("org_id", orgId);
    if (error) throw error;
    return { ok: true };
  });
