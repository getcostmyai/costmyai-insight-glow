import { planAtLeast, type PlanTier } from "../engine/types";

/**
 * The entitlement rule, in one place.
 *
 * There is deliberately no promotional escape hatch here — no launch-free
 * window, no date after which paid levels are given away, no environment
 * variable that can grant a tier. A workspace is entitled to a paid level only
 * while a real subscription for that level is in a paying state. Compare is the
 * only free level and is always available.
 */

export interface SubscriptionState {
  plan: PlanTier;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

/** Statuses where the customer still has a live billing relationship. */
const PAYING = new Set(["active", "trialing", "past_due"]);

export function subscriptionIsCurrent(sub: SubscriptionState, now: Date = new Date()): boolean {
  const endsAt = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
  const withinPeriod = endsAt === null || endsAt.getTime() > now.getTime();
  if (PAYING.has(sub.status)) return withinPeriod;
  // A cancelled subscription keeps the level until the period they paid for ends.
  if (sub.status === "canceled") return endsAt !== null && endsAt.getTime() > now.getTime();
  return false;
}

/** The level a workspace may actually use right now. */
export function effectivePlan(
  orgPlan: PlanTier,
  subscription: SubscriptionState | null,
  now: Date = new Date(),
): PlanTier {
  if (orgPlan === "compare") return "compare";
  if (!subscription || !subscriptionIsCurrent(subscription, now)) return "compare";
  // Never grant more than both the workspace record and the subscription agree on.
  return planAtLeast(subscription.plan, orgPlan) ? orgPlan : subscription.plan;
}

export function isEntitledTo(
  required: PlanTier,
  orgPlan: PlanTier,
  subscription: SubscriptionState | null,
  now: Date = new Date(),
): boolean {
  return planAtLeast(effectivePlan(orgPlan, subscription, now), required);
}

/**
 * Who is granting the level, and why.
 *
 * `subscription` — a real paying subscription in this build's payment
 * environment. `platform_admin` — CostMyAI staff looking at a workspace they
 * administer; explicit, never inferred from a payment row. `free` — Compare.
 */
export type PlanAccessSource = "free" | "subscription" | "platform_admin";

export interface ResolvedAccess {
  plan: PlanTier;
  source: PlanAccessSource;
}

/**
 * The level a workspace may use, and on what authority.
 *
 * Staff access is deliberately a separate branch from billing: it never writes
 * or reads a payment row, it grants no more than the workspace's own recorded
 * plan, and it is reported as `platform_admin` so every surface can say out
 * loud that this is not a paid subscription.
 */
export function resolveAccess(
  orgPlan: PlanTier,
  subscription: SubscriptionState | null,
  isPlatformAdmin: boolean,
  now: Date = new Date(),
): ResolvedAccess {
  const paid = effectivePlan(orgPlan, subscription, now);
  if (paid !== "compare") return { plan: paid, source: "subscription" };
  if (isPlatformAdmin && orgPlan !== "compare") return { plan: orgPlan, source: "platform_admin" };
  return { plan: "compare", source: "free" };
}
