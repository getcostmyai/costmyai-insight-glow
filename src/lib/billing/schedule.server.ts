import type { PlanTier } from "../engine/types";
import { PLAN_META } from "../engine/types";
import { PAID_PLANS, type BillingInterval } from "./catalog";
import type { StripeEnvName } from "./guard.server";

/**
 * What the provider has already booked to happen at the end of this period.
 *
 * A scheduled downgrade is real, paid-for state: the customer is on Govern
 * today and will be invoiced for Certify next month. Reading it from the
 * provider's own schedule is the only honest source — the subscription row
 * carries today's price and knows nothing about the phase after it.
 */
export interface ScheduledPlanChange {
  plan: PlanTier;
  interval: BillingInterval;
  monthlyUsd: number;
  effectiveIso: string;
}

function planFromLookupKey(
  lookupKey: string | null | undefined,
): { plan: PlanTier; interval: BillingInterval } | null {
  if (!lookupKey) return null;
  for (const paid of PAID_PLANS) {
    if (paid.priceIds.monthly === lookupKey) return { plan: paid.plan, interval: "monthly" };
    if (paid.priceIds.yearly === lookupKey) return { plan: paid.plan, interval: "yearly" };
  }
  return null;
}

/**
 * Returns the next phase's plan when it differs from what is billing today,
 * and null otherwise. Never throws: a provider hiccup must degrade to "no
 * scheduled change shown", not to a billing page that fails to render.
 */
export async function loadScheduledChange(
  subscriptionId: string,
  environment: StripeEnvName,
  now: Date = new Date(),
): Promise<ScheduledPlanChange | null> {
  try {
    const { createStripeClient } = await import("../stripe.server");
    const stripe = createStripeClient(environment);
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const scheduleId =
      typeof subscription.schedule === "string"
        ? subscription.schedule
        : (subscription.schedule?.id ?? null);
    if (!scheduleId) return null;

    const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
    if (schedule.status !== "active" && schedule.status !== "not_started") return null;

    const currentKey = subscription.items?.data?.[0]?.price?.lookup_key ?? null;
    const nowSec = Math.floor(now.getTime() / 1000);

    const upcoming = (schedule.phases ?? [])
      .filter((phase) => (phase.start_date ?? 0) > nowSec)
      .sort((a, b) => (a.start_date ?? 0) - (b.start_date ?? 0))[0];
    if (!upcoming) return null;

    const priceRef = upcoming.items?.[0]?.price;
    const priceId = typeof priceRef === "string" ? priceRef : (priceRef?.id ?? null);
    if (!priceId) return null;

    const price = await stripe.prices.retrieve(priceId);
    if (price.lookup_key && currentKey && price.lookup_key === currentKey) return null;

    const mapped = planFromLookupKey(price.lookup_key);
    if (!mapped) return null;

    return {
      plan: mapped.plan,
      interval: mapped.interval,
      monthlyUsd:
        mapped.interval === "yearly"
          ? PLAN_META[mapped.plan].yearly
          : PLAN_META[mapped.plan].monthly,
      effectiveIso: new Date((upcoming.start_date ?? 0) * 1000).toISOString(),
    };
  } catch (error) {
    console.error("scheduled plan change lookup failed:", error);
    return null;
  }
}
