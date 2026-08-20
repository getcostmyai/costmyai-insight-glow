import { PLAN_META, type PlanTier } from "../engine/types";

/**
 * The four levels as they are actually sold.
 *
 * Compare is free and has no price — it is what a workspace gets on creation.
 * Everything above it is paid, from the day the product goes live: there is no
 * promotional period, no launch-free window, and no environment variable that
 * can hand out a paid level. A workspace is on a paid tier because a live
 * subscription says so, or it is not on it at all.
 */

export type BillingInterval = "monthly" | "yearly";

export interface PaidPlan {
  plan: Exclude<PlanTier, "compare">;
  /** Price ids registered with the payment provider; stable across environments. */
  priceIds: Record<BillingInterval, string>;
}

export const PAID_PLANS: PaidPlan[] = [
  { plan: "certify", priceIds: { monthly: "certify_monthly", yearly: "certify_yearly" } },
  { plan: "rightsize", priceIds: { monthly: "rightsize_monthly", yearly: "rightsize_yearly" } },
  { plan: "govern", priceIds: { monthly: "govern_monthly", yearly: "govern_yearly" } },
];

/**
 * Levels a workspace may buy on its own from /pricing or /billing.
 *
 * Rightsize and Govern are in closed beta: they are not sold self-serve, and
 * are reached only through an unlisted checkout link handed out by hand. The
 * grant path is identical either way — a signed webhook, and nothing else.
 */
export const SELF_SERVE_PLANS: PlanTier[] = ["certify"];
export const BETA_PLANS: Exclude<PlanTier, "compare">[] = ["rightsize", "govern"];

export function isBetaPlan(plan: PlanTier): plan is "rightsize" | "govern" {
  return BETA_PLANS.includes(plan as "rightsize" | "govern");
}

/**
 * Unlisted prices for the hand-picked beta circle. Referenced by the private
 * checkout path only — never by /pricing, /billing or `priceIdFor`.
 */
export const BETA_PRICE_IDS: Record<"rightsize" | "govern", string> = {
  rightsize: "rightsize_private_beta_monthly",
  govern: "govern_private_beta_monthly",
};

/** Reverse map used by the webhook to turn a purchased price back into a level. */
export const PLAN_BY_PRICE_ID: Record<string, PlanTier> = PAID_PLANS.reduce(
  (acc, p) => {
    acc[p.priceIds.monthly] = p.plan;
    acc[p.priceIds.yearly] = p.plan;
    return acc;
  },
  { [BETA_PRICE_IDS.rightsize]: "rightsize", [BETA_PRICE_IDS.govern]: "govern" } as Record<
    string,
    PlanTier
  >,
);

export function priceIdFor(plan: PlanTier, interval: BillingInterval): string | null {
  return PAID_PLANS.find((p) => p.plan === plan)?.priceIds[interval] ?? null;
}

/** What the customer is charged per month, in whole dollars, for each interval. */
export function monthlyRate(plan: PlanTier, interval: BillingInterval): number {
  const meta = PLAN_META[plan];
  return interval === "yearly" ? meta.yearly : meta.monthly;
}
