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

    const { data: saved, error } = await context.supabase
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
      .eq("org_id", orgId)
      .select("org_id")
      .maybeSingle();
    if (error) throw error;
    // Dispatch 91. These answers place the workspace in a benchmark bucket
    // other companies read. A no-op that reported success would quietly leave
    // it in the old bucket while the screen showed the new answers.
    if (!saved) throw new Error("Those answers could not be saved to this workspace.");

    const state = await stateFor(context.supabase, orgId);
    return { ...state, warning: verdict.warning };
  });

/**
 * Dispatch 121. Every workspace created through the current signup flow gets
 * its profile row written alongside the workspace itself. Workspaces created
 * before that flow existed have none, and the benchmark panel used to render
 * nothing at all for them — silently, with no way back in. This is that way
 * back in: the same two questions signup asks, asked once, in place.
 */
export const startBenchmarkProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { useCase: string; useCaseOther?: string | null; industry: string }) => {
    if (!isUseCase(data?.useCase)) throw new Error("Pick what you mainly use AI for.");
    if (!isIndustry(data?.industry)) throw new Error("Pick the industry closest to yours.");
    return {
      useCase: data.useCase as UseCase,
      useCaseOther:
        data.useCase === "other" ? (data.useCaseOther ?? "").trim().slice(0, 120) || null : null,
      industry: data.industry,
    };
  })
  .handler(async ({ context, data }): Promise<ProfileState> => {
    const orgId = await resolveOrg(context as never);
    const existing = await readProfile(context.supabase, orgId);
    // Never overwrite what signup already recorded.
    if (!existing) {
      const { data: saved, error } = await context.supabase
        .from("org_profiles")
        .insert({
          org_id: orgId,
          use_case: data.useCase,
          use_case_other: data.useCaseOther,
          industry: data.industry,
        })
        .select("org_id")
        .maybeSingle();
      if (error) throw error;
      if (!saved) throw new Error("That profile could not be saved to this workspace.");
    }
    return stateFor(context.supabase, orgId);
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
