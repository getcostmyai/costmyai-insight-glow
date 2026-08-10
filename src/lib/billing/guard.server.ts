import type { SupabaseClient } from "@supabase/supabase-js";

import type { PlanTier } from "../engine/types";
import {
  effectivePlan,
  isEntitledTo,
  resolveAccess,
  type PlanAccessSource,
  type SubscriptionState,
} from "./entitlement";
import { planAtLeast } from "../engine/types";

/**
 * Server-side plan gate.
 *
 * It reads through the caller's own RLS-scoped client, so a workspace id in a
 * request body can only ever resolve to a workspace the caller belongs to. The
 * check itself is exactly two facts — the workspace's plan and its live
 * subscription — and nothing else. No promotional bypass exists.
 */

export type StripeEnvName = "sandbox" | "live";

/**
 * A subscription that exists, but in the other payment environment.
 *
 * Sandbox and live rows share one table and every read is scoped to the
 * environment the build runs against, so a row written by a test-mode checkout
 * is invisible to a live build. That is correct — it must never unlock a paid
 * level — but silently falling back to Compare hides the reason. This carries
 * the fact so the billing page can say it out loud.
 */
export interface OtherEnvSubscription {
  environment: StripeEnvName;
  plan: PlanTier;
  status: string;
}

export interface PlanState {
  plan: PlanTier;
  subscription: SubscriptionState | null;
  otherEnv: OtherEnvSubscription | null;
  isPlatformAdmin: boolean;
}

const otherEnvironment = (e: StripeEnvName): StripeEnvName =>
  e === "live" ? "sandbox" : "live";

function toState(row: any): SubscriptionState {
  return {
    plan: row.plan as PlanTier,
    status: row.status as string,
    currentPeriodEnd: (row.current_period_end as string | null) ?? null,
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
  };
}

export async function loadPlanState(
  supabase: SupabaseClient<any, any, any>,
  orgId: string,
  environment: StripeEnvName,
): Promise<PlanState> {
  const other = otherEnvironment(environment);
  const [org, sub, otherSub, admin] = await Promise.all([
    supabase.from("organizations").select("plan").eq("id", orgId).maybeSingle(),
    supabase
      .from("subscriptions")
      .select("plan, status, current_period_end, cancel_at_period_end")
      .eq("org_id", orgId)
      .eq("environment", environment)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("subscriptions")
      .select("plan, status, current_period_end, cancel_at_period_end")
      .eq("org_id", orgId)
      .eq("environment", other)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.rpc("is_platform_admin"),
  ]);

  if (org.error) throw org.error;
  if (!org.data) throw new Error("Unknown workspace");

  return {
    plan: org.data.plan as PlanTier,
    subscription: sub.data ? toState(sub.data) : null,
    otherEnv: otherSub.data
      ? {
          environment: other,
          plan: otherSub.data.plan as PlanTier,
          status: otherSub.data.status as string,
        }
      : null,
    isPlatformAdmin: admin.data === true,
  };
}

/** The level this workspace may actually use right now. */
export async function resolvePlan(
  supabase: SupabaseClient<any, any, any>,
  orgId: string,
  environment: StripeEnvName,
): Promise<PlanTier> {
  const state = await loadPlanState(supabase, orgId, environment);
  return resolveAccess(state.plan, state.subscription, state.isPlatformAdmin).plan;
}

/** Throws unless the workspace is currently paying for `required` (or better). */
export async function requirePlan(
  supabase: SupabaseClient<any, any, any>,
  orgId: string,
  required: PlanTier,
  environment: StripeEnvName,
): Promise<PlanTier> {
  const state = await loadPlanState(supabase, orgId, environment);
  const paidEntitled = isEntitledTo(required, state.plan, state.subscription);
  // Staff access is an explicit second branch, never a payment row: a platform
  // admin gets no more than the workspace's own recorded plan, and an ordinary
  // customer is refused exactly as before.
  const staffEntitled = state.isPlatformAdmin && planAtLeast(state.plan, required);
  if (!paidEntitled && !staffEntitled) {
    throw new Error(`This workspace is not on the ${required} plan.`);
  }
  return resolveAccess(state.plan, state.subscription, state.isPlatformAdmin).plan;
}

/** The level and the authority behind it — for surfaces that must say which. */
export async function resolveAccessFor(
  supabase: SupabaseClient<any, any, any>,
  orgId: string,
  environment: StripeEnvName,
): Promise<{ plan: PlanTier; source: PlanAccessSource; state: PlanState }> {
  const state = await loadPlanState(supabase, orgId, environment);
  const access = resolveAccess(state.plan, state.subscription, state.isPlatformAdmin);
  return { ...access, state };
}
