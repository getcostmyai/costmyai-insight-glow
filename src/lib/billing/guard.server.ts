import type { SupabaseClient } from "@supabase/supabase-js";

import type { PlanTier } from "../engine/types";
import { effectivePlan, isEntitledTo, type SubscriptionState } from "./entitlement";

/**
 * Server-side plan gate.
 *
 * It reads through the caller's own RLS-scoped client, so a workspace id in a
 * request body can only ever resolve to a workspace the caller belongs to. The
 * check itself is exactly two facts — the workspace's plan and its live
 * subscription — and nothing else. No promotional bypass exists.
 */

export type StripeEnvName = "sandbox" | "live";

export async function loadPlanState(
  supabase: SupabaseClient<any, any, any>,
  orgId: string,
  environment: StripeEnvName,
): Promise<{ plan: PlanTier; subscription: SubscriptionState | null }> {
  const [org, sub] = await Promise.all([
    supabase.from("organizations").select("plan").eq("id", orgId).maybeSingle(),
    supabase
      .from("subscriptions")
      .select("plan, status, current_period_end, cancel_at_period_end")
      .eq("org_id", orgId)
      .eq("environment", environment)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (org.error) throw org.error;
  if (!org.data) throw new Error("Unknown workspace");

  return {
    plan: org.data.plan as PlanTier,
    subscription: sub.data
      ? {
          plan: sub.data.plan as PlanTier,
          status: sub.data.status as string,
          currentPeriodEnd: (sub.data.current_period_end as string | null) ?? null,
          cancelAtPeriodEnd: Boolean(sub.data.cancel_at_period_end),
        }
      : null,
  };
}

/** The rung this workspace may actually use right now. */
export async function resolvePlan(
  supabase: SupabaseClient<any, any, any>,
  orgId: string,
  environment: StripeEnvName,
): Promise<PlanTier> {
  const { plan, subscription } = await loadPlanState(supabase, orgId, environment);
  return effectivePlan(plan, subscription);
}

/** Throws unless the workspace is currently paying for `required` (or better). */
export async function requirePlan(
  supabase: SupabaseClient<any, any, any>,
  orgId: string,
  required: PlanTier,
  environment: StripeEnvName,
): Promise<PlanTier> {
  const { plan, subscription } = await loadPlanState(supabase, orgId, environment);
  if (!isEntitledTo(required, plan, subscription)) {
    throw new Error(`This workspace is not on the ${required} plan.`);
  }
  return effectivePlan(plan, subscription);
}
