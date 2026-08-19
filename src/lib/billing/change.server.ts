import type Stripe from "stripe";

import { PLAN_META, PLAN_ORDER, type PlanTier } from "../engine/types";
import { PAID_PLANS, monthlyRate, type BillingInterval } from "./catalog";
import type { StripeEnvName } from "./guard.server";

/**
 * Changing the level of a subscription that already exists.
 *
 * The old path sent an already-paying workspace back through checkout, which
 * created a SECOND subscription against a second customer and billed the
 * workspace twice. There is exactly one correct move on a live subscription:
 * modify it. This module is that move, and the policy it applies is fixed:
 *
 *   - Upgrades take effect immediately, with normal proration. The customer is
 *     credited for the unused part of the level they are leaving and charged
 *     the prorated remainder of the one they are entering; the difference
 *     lands on the next invoice.
 *   - Downgrades are booked for the end of the period already paid for. Nobody
 *     is refunded for a level they had access to, and nobody loses access they
 *     have paid for. The switch happens at the renewal boundary.
 *
 * An interval change follows the same rule by cost direction: monthly to
 * yearly bills now, yearly to monthly waits for the boundary.
 */

export type ChangeKind = "upgrade" | "downgrade" | "noop";

export interface CurrentSubscriptionShape {
  subscriptionId: string;
  itemId: string;
  plan: PlanTier;
  interval: BillingInterval;
  periodEndIso: string | null;
  scheduleId: string | null;
  currency: string;
}

export interface PlanChangePreview {
  kind: ChangeKind;
  currentPlan: PlanTier;
  currentInterval: BillingInterval;
  targetPlan: PlanTier;
  targetInterval: BillingInterval;
  /** When the customer actually starts being billed at the new level. */
  effectiveIso: string | null;
  /**
   * What the provider says is due now for an immediate change, in the
   * subscription's own currency. Null when nothing is charged today (a
   * deferred downgrade) or when the provider could not be asked.
   */
  nextInvoiceTotalUsd: number | null;
  currency: string;
  /** Present when the amount could not be read, so the page can say why. */
  quoteUnavailableReason: string | null;
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
 * Which direction the money moves. Tier order decides first, because that is
 * what the customer is buying; interval only breaks a tie, where monthly to
 * yearly is the one that bills a larger amount sooner.
 */
export function classifyChange(
  from: { plan: PlanTier; interval: BillingInterval },
  to: { plan: PlanTier; interval: BillingInterval },
): ChangeKind {
  if (from.plan === to.plan && from.interval === to.interval) return "noop";
  const tierDelta = PLAN_ORDER.indexOf(to.plan) - PLAN_ORDER.indexOf(from.plan);
  if (tierDelta > 0) return "upgrade";
  if (tierDelta < 0) return "downgrade";
  return to.interval === "yearly" ? "upgrade" : "downgrade";
}

/** Reads the live subscription and states plainly what it is on today. */
export async function readCurrentSubscription(
  stripe: Stripe,
  subscriptionId: string,
): Promise<CurrentSubscriptionShape> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const item = subscription.items?.data?.[0];
  if (!item) throw new Error("This subscription has no billable item.");

  const mapped = planFromLookupKey(item.price?.lookup_key);
  if (!mapped) {
    throw new Error(
      "This subscription is on a price CostMyAI does not sell any more. Contact support to move it.",
    );
  }

  const periodEnd =
    (item as any).current_period_end ?? (subscription as any).current_period_end ?? null;

  return {
    subscriptionId: subscription.id,
    itemId: item.id,
    plan: mapped.plan,
    interval: mapped.interval,
    periodEndIso: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    scheduleId:
      typeof subscription.schedule === "string"
        ? subscription.schedule
        : (subscription.schedule?.id ?? null),
    currency: (item.price?.currency ?? subscription.currency ?? "usd").toUpperCase(),
  };
}

async function resolvePriceId(stripe: Stripe, lookupKey: string): Promise<string> {
  const prices = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
  const price = prices.data[0];
  if (!price) throw new Error("That price is not registered with the payment provider.");
  return price.id;
}

/**
 * What the change costs today, asked of the provider rather than computed
 * here. Proration arithmetic belongs to whoever issues the invoice; a number
 * we worked out ourselves would be a guess dressed up as a quote.
 */
export async function previewChange(
  stripe: Stripe,
  current: CurrentSubscriptionShape,
  target: { plan: PlanTier; interval: BillingInterval },
  customerId: string,
): Promise<PlanChangePreview> {
  const kind = classifyChange(current, target);
  const base = {
    kind,
    currentPlan: current.plan,
    currentInterval: current.interval,
    targetPlan: target.plan,
    targetInterval: target.interval,
    currency: current.currency,
  };

  if (kind === "noop") {
    return {
      ...base,
      effectiveIso: null,
      nextInvoiceTotalUsd: null,
      quoteUnavailableReason: null,
    };
  }

  if (kind === "downgrade") {
    // Nothing is charged and nothing is refunded — the switch waits for the
    // boundary of the period the customer already paid for.
    return {
      ...base,
      effectiveIso: current.periodEndIso,
      nextInvoiceTotalUsd: null,
      quoteUnavailableReason: null,
    };
  }

  const lookupKey = PAID_PLANS.find((p) => p.plan === target.plan)?.priceIds[target.interval];
  if (!lookupKey) throw new Error("No price for that plan");

  let nextInvoiceTotalUsd: number | null = null;
  let quoteUnavailableReason: string | null = null;
  try {
    const priceId = await resolvePriceId(stripe, lookupKey);
    const preview = await (stripe.invoices as any).createPreview({
      customer: customerId,
      subscription: current.subscriptionId,
      subscription_details: {
        items: [{ id: current.itemId, price: priceId, quantity: 1 }],
        proration_behavior: "create_prorations",
      },
    });
    nextInvoiceTotalUsd = Number(preview?.amount_due ?? 0) / 100;
  } catch (error) {
    quoteUnavailableReason = (error as Error).message;
  }

  return {
    ...base,
    effectiveIso: new Date().toISOString(),
    nextInvoiceTotalUsd,
    quoteUnavailableReason,
  };
}

export interface AppliedChange {
  kind: ChangeKind;
  effectiveIso: string | null;
  targetPlan: PlanTier;
  targetInterval: BillingInterval;
  monthlyUsd: number;
}

/** Drops any booked future phase, so the subscription is free to be modified. */
async function releaseSchedule(stripe: Stripe, scheduleId: string | null): Promise<void> {
  if (!scheduleId) return;
  try {
    await stripe.subscriptionSchedules.release(scheduleId);
  } catch (error) {
    // Already released or completed: nothing is booked, which is the state we
    // wanted anyway.
    console.warn("schedule release skipped:", (error as Error).message);
  }
}

export async function applyChange(
  stripe: Stripe,
  current: CurrentSubscriptionShape,
  target: { plan: PlanTier; interval: BillingInterval },
  metadata: { orgId: string; userId: string },
  environment: StripeEnvName,
): Promise<AppliedChange> {
  const kind = classifyChange(current, target);
  const monthlyUsd = monthlyRate(target.plan, target.interval);

  if (kind === "noop") {
    // Asking for the level you are already on is how a customer cancels a
    // booked downgrade, so honour it by clearing the future phase.
    await releaseSchedule(stripe, current.scheduleId);
    return {
      kind,
      effectiveIso: null,
      targetPlan: target.plan,
      targetInterval: target.interval,
      monthlyUsd,
    };
  }

  const lookupKey = PAID_PLANS.find((p) => p.plan === target.plan)?.priceIds[target.interval];
  if (!lookupKey) throw new Error("No price for that plan");
  const priceId = await resolvePriceId(stripe, lookupKey);

  if (kind === "upgrade") {
    // A pending downgrade must go first: a schedule owns the subscription's
    // future, and modifying underneath it would be undone at the boundary.
    await releaseSchedule(stripe, current.scheduleId);

    await stripe.subscriptions.update(current.subscriptionId, {
      items: [{ id: current.itemId, price: priceId, quantity: 1 }],
      proration_behavior: "create_prorations",
      // The workspace, not the person, owns the subscription — keep the
      // metadata the webhook resolves the workspace from intact through the
      // change, and keep the recorded level honest.
      metadata: {
        userId: metadata.userId,
        orgId: metadata.orgId,
        plan: target.plan,
        environment,
      },
    });

    return {
      kind,
      effectiveIso: new Date().toISOString(),
      targetPlan: target.plan,
      targetInterval: target.interval,
      monthlyUsd,
    };
  }

  // Downgrade: book it for the boundary with a schedule, leaving today's
  // period exactly as sold.
  let scheduleId = current.scheduleId;
  if (!scheduleId) {
    const created = await stripe.subscriptionSchedules.create({
      from_subscription: current.subscriptionId,
    });
    scheduleId = created.id;
  }

  const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
  const phases = schedule.phases ?? [];
  const currentPhase = phases.find(
    (p) => (p.start_date ?? 0) <= Math.floor(Date.now() / 1000) && (p.end_date ?? Infinity) > Math.floor(Date.now() / 1000),
  ) ?? phases[0];
  if (!currentPhase) throw new Error("The provider returned a schedule with no current phase.");

  const currentItems = (currentPhase.items ?? []).map((i) => ({
    price: typeof i.price === "string" ? i.price : (i.price?.id ?? ""),
    quantity: i.quantity ?? 1,
  }));

  await stripe.subscriptionSchedules.update(scheduleId, {
    end_behavior: "release",
    phases: [
      {
        items: currentItems,
        start_date: currentPhase.start_date,
        end_date: currentPhase.end_date,
        proration_behavior: "none",
      },
      {
        items: [{ price: priceId, quantity: 1 }],
        proration_behavior: "none",
        metadata: { userId: metadata.userId, orgId: metadata.orgId, plan: target.plan },
      },
    ] as any,
    metadata: { userId: metadata.userId, orgId: metadata.orgId, plan: target.plan },
  });

  return {
    kind,
    effectiveIso: current.periodEndIso,
    targetPlan: target.plan,
    targetInterval: target.interval,
    monthlyUsd: PLAN_META[target.plan][target.interval === "yearly" ? "yearly" : "monthly"],
  };
}

/** Clears a booked future phase and leaves today's level running. */
export async function cancelScheduledChange(
  stripe: Stripe,
  current: CurrentSubscriptionShape,
): Promise<void> {
  await releaseSchedule(stripe, current.scheduleId);
}
