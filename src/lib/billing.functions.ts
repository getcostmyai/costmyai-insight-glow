import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import type { PlanTier } from "./engine/types";
import { PAID_PLANS, priceIdFor, type BillingInterval } from "./billing/catalog";
import { type SubscriptionState } from "./billing/entitlement";

/**
 * Billing for the four levels.
 *
 * Compare is free. Certify, Rightsize and Govern are reachable only through a
 * real checkout — there is no promotional path, and no request the browser can
 * make that upgrades a workspace without the provider confirming payment. The
 * only writer of `organizations.plan` for paid tiers is the signed webhook.
 */

type Env = "sandbox" | "live";

const UUID = /^[0-9a-f-]{36}$/i;

function validEnv(value: unknown): Env {
  if (value !== "sandbox" && value !== "live") throw new Error("Unknown payment environment");
  return value;
}

/**
 * Authority over a workspace is asked of the database, never taken from the
 * request. The browser names a workspace; whether the caller may act on its
 * billing is re-derived from their own session by `is_org_manager`.
 */
async function assertManager(
  supabase: {
    rpc: (
      fn: "is_org_manager",
      args: { _org_id: string },
    ) => PromiseLike<{ data: unknown; error: unknown }>;
  },
  orgId: string,
) {
  const { data, error } = await supabase.rpc("is_org_manager", { _org_id: orgId });
  if (error) throw error;
  if (data !== true) throw new Error("Only a workspace owner or admin can manage billing.");
}


export interface WorkspaceBilling {
  orgId: string;
  recordedPlan: PlanTier;
  /** What the workspace may actually use — the plan gate's answer. */
  effectivePlan: PlanTier;
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  /**
   * Whether this caller may act on billing. Answered by the database, not by
   * the browser: the page uses it to hide controls it would be refused anyway,
   * never as the thing that does the refusing.
   */
  canManage: boolean;
  /**
   * On what authority the level is granted: a paying subscription, explicit
   * platform-admin staff access, or nothing (Compare).
   */
  accessSource: "free" | "subscription" | "platform_admin";
  /**
   * A subscription that exists for this workspace but was written in the other
   * payment environment, so it cannot and must not unlock anything here. Null
   * in the normal case.
   */
  otherEnvironmentSubscription: {
    environment: "sandbox" | "live";
    plan: PlanTier;
    status: string;
  } | null;
  /**
   * A plan change the provider has already scheduled for the end of the current
   * period — a downgrade, an upgrade, or an interval switch booked through a
   * subscription schedule. Read from the provider, never inferred: the billing
   * page must not show today's price as if nothing changes when the next
   * invoice will be for a different level.
   */
  scheduledChange: {
    plan: PlanTier;
    interval: BillingInterval;
    monthlyUsd: number;
    effectiveIso: string;
  } | null;
}

export const getWorkspaceBilling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orgId: string; environment: Env }) => {
    if (!UUID.test(data?.orgId ?? "")) throw new Error("Unknown workspace");
    return { orgId: data.orgId, environment: validEnv(data.environment) };
  })
  .handler(async ({ data, context }): Promise<WorkspaceBilling> => {
    const { loadPlanState } = await import("./billing/guard.server");
    const { resolveAccess } = await import("./billing/entitlement");
    const { loadScheduledChange } = await import("./billing/schedule.server");
    const [state, manager, orgRow] = await Promise.all([
      loadPlanState(context.supabase, data.orgId, data.environment),
      context.supabase.rpc("is_org_manager", { _org_id: data.orgId }),
      context.supabase
        .from("organizations")
        .select("stripe_subscription_id")
        .eq("id", data.orgId)
        .maybeSingle(),
    ]);
    const access = resolveAccess(state.plan, state.subscription, state.isPlatformAdmin);

    // Only ask the provider when there is a live subscription to ask about.
    const subscriptionId = orgRow.data?.stripe_subscription_id ?? null;
    const scheduledChange =
      state.subscription && subscriptionId
        ? await loadScheduledChange(subscriptionId, data.environment)
        : null;

    return {
      orgId: data.orgId,
      recordedPlan: state.plan,
      effectivePlan: access.plan,
      accessSource: access.source,
      otherEnvironmentSubscription: state.otherEnv,
      status: state.subscription?.status ?? null,
      currentPeriodEnd: state.subscription?.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: state.subscription?.cancelAtPeriodEnd ?? false,
      canManage: manager.data === true,
      scheduledChange,
    };

  });

type CheckoutResult = { clientSecret: string } | { error: string };

export const createPlanCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      orgId: string;
      plan: PlanTier;
      interval: BillingInterval;
      returnUrl: string;
      environment: Env;
    }) => {
      if (!UUID.test(data?.orgId ?? "")) throw new Error("Unknown workspace");
      if (data?.interval !== "monthly" && data?.interval !== "yearly") {
        throw new Error("Unknown billing interval");
      }
      if (!PAID_PLANS.some((p) => p.plan === data?.plan)) {
        throw new Error("That plan is not sold — Compare is free and needs no checkout.");
      }
      if (typeof data?.returnUrl !== "string" || !data.returnUrl.startsWith("http")) {
        throw new Error("Invalid return URL");
      }
      return {
        orgId: data.orgId,
        plan: data.plan,
        interval: data.interval,
        returnUrl: data.returnUrl,
        environment: validEnv(data.environment),
      };
    },
  )
  .handler(async ({ data, context }): Promise<CheckoutResult> => {
    const { createStripeClient, getStripeErrorMessage } = await import("./stripe.server");

    // Only a manager of this workspace may put it on a paid plan. RLS already
    // scopes the read; this is the authority check on top of membership.
    const { data: isManager, error: roleError } = await context.supabase.rpc("is_org_manager", {
      _org_id: data.orgId,
    });
    if (roleError) throw roleError;
    if (!isManager) throw new Error("Only a workspace owner or admin can change the plan.");

    // A second checkout for a workspace that is already paying creates a
    // SECOND subscription against a second customer — the workspace is then
    // billed twice with no way back through the hosted portal. Until a real
    // plan-switch path exists, a live subscription refuses checkout outright.
    const { data: existing, error: existingError } = await context.supabase
      .from("subscriptions")
      .select("plan, status, current_period_end")
      .eq("org_id", data.orgId)
      .eq("environment", data.environment)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      const end = existing.current_period_end
        ? new Date(existing.current_period_end).getTime()
        : null;
      const stillWithinPaidPeriod = end === null || end > Date.now();
      const live =
        ["active", "trialing", "past_due"].includes(existing.status as string) &&
        stillWithinPaidPeriod;
      if (live) {
        return {
          error:
            `This workspace already has an active ${existing.plan} subscription. ` +
            `Starting a second checkout would bill it twice. ` +
            `Cancel the current plan from the billing portal first, or contact support to change plans.`,
        };
      }
    }

    const priceId = priceIdFor(data.plan, data.interval);
    if (!priceId) throw new Error("No price for that plan");

    try {
      const stripe = createStripeClient(data.environment);
      const prices = await stripe.prices.list({ lookup_keys: [priceId] });
      if (!prices.data.length) throw new Error("Price not found");
      const price = prices.data[0]!;

      const userId = context.userId;
      const email = (context.claims.email as string | undefined) ?? undefined;

      // One provider customer per WORKSPACE, not per person.
      //
      // The customer record is the boundary the provider's own hosted pages
      // respect: a billing-portal session and an invoice list are scoped to a
      // customer and nothing finer. If one person paying for two workspaces
      // shared a single customer, the billing page of workspace A would expose
      // — and be able to cancel — workspace B's subscription. So the search key
      // is the org id, and reuse by email address is deliberately gone: matching
      // on an address merges exactly the customers that must stay separate.
      let customerId: string | undefined;
      const found = await stripe.customers.search({
        query: `metadata['orgId']:'${data.orgId}'`,
        limit: 1,
      });
      if (found.data.length) {
        customerId = found.data[0]!.id;
      }
      if (!customerId) {
        const created = await stripe.customers.create({
          ...(email && { email }),
          metadata: { userId, orgId: data.orgId },
        });
        customerId = created.id;
      }


      const session = await stripe.checkout.sessions.create({
        line_items: [{ price: price.id, quantity: 1 }],
        mode: "subscription",
        ui_mode: "embedded_page",
        return_url: data.returnUrl,
        customer: customerId,
        billing_address_collection: "required",
        managed_payments: { enabled: true },
        metadata: { userId, orgId: data.orgId, plan: data.plan, managed_payments: "true" },
        subscription_data: {
          metadata: { userId, orgId: data.orgId, plan: data.plan },
        },
      } as any);

      return { clientSecret: session.client_secret ?? "" };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

type PortalResult = { url: string } | { error: string };

export const createBillingPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orgId: string; returnUrl?: string; environment: Env }) => {
    if (!UUID.test(data?.orgId ?? "")) throw new Error("Unknown workspace");
    return {
      orgId: data.orgId,
      returnUrl: data.returnUrl,
      environment: validEnv(data.environment),
    };
  })
  .handler(async ({ data, context }): Promise<PortalResult> => {
    const { createStripeClient, getStripeErrorMessage } = await import("./stripe.server");

    // The portal can cancel the subscription and change the card on file, so
    // membership is not enough. RLS on `subscriptions` stops another tenant
    // outright; this stops an ordinary member of this workspace from ending
    // the plan their owner is paying for.
    await assertManager(context.supabase, data.orgId);

    const { data: sub } = await context.supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("org_id", data.orgId)
      .eq("environment", data.environment)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!sub?.stripe_customer_id) throw new Error("This workspace has no subscription yet.");


    try {
      const stripe = createStripeClient(data.environment);
      const portal = await stripe.billingPortal.sessions.create({
        customer: sub.stripe_customer_id as string,
        ...(data.returnUrl && { return_url: data.returnUrl }),
      });
      return { url: portal.url };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

/**
 * Changing the level of a workspace that is ALREADY paying.
 *
 * This is the only correct path for an existing subscriber: checkout would
 * create a second subscription and bill the workspace twice. The policy is
 * fixed and is not the caller's to choose — upgrades apply now with normal
 * proration, downgrades are booked for the end of the period already paid for.
 */

async function liveSubscriptionFor(
  supabase: any,
  orgId: string,
  environment: Env,
): Promise<{ subscriptionId: string; customerId: string }> {
  const { data: sub, error } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id, stripe_customer_id, status, current_period_end")
    .eq("org_id", orgId)
    .eq("environment", environment)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!sub?.stripe_subscription_id || !sub?.stripe_customer_id) {
    throw new Error("This workspace has no subscription to change yet.");
  }
  const end = sub.current_period_end ? new Date(sub.current_period_end).getTime() : null;
  const live =
    ["active", "trialing", "past_due"].includes(sub.status as string) &&
    (end === null || end > Date.now());
  if (!live) {
    throw new Error(
      "This workspace has no live subscription, so there is nothing to change. Choose a plan to subscribe.",
    );
  }
  return {
    subscriptionId: sub.stripe_subscription_id as string,
    customerId: sub.stripe_customer_id as string,
  };
}

function validatePlanChangeInput(data: {
  orgId: string;
  plan: PlanTier;
  interval: BillingInterval;
  environment: Env;
}) {
  if (!UUID.test(data?.orgId ?? "")) throw new Error("Unknown workspace");
  if (data?.interval !== "monthly" && data?.interval !== "yearly") {
    throw new Error("Unknown billing interval");
  }
  if (!PAID_PLANS.some((p) => p.plan === data?.plan)) {
    throw new Error(
      "Compare is free — to leave a paid level, cancel the subscription from the billing portal.",
    );
  }
  return {
    orgId: data.orgId,
    plan: data.plan,
    interval: data.interval,
    environment: validEnv(data.environment),
  };
}

export type PlanChangeQuote =
  | (import("./billing/change.server").PlanChangePreview & { ok: true })
  | { ok: false; error: string };

export const previewPlanChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validatePlanChangeInput)
  .handler(async ({ data, context }): Promise<PlanChangeQuote> => {
    await assertManager(context.supabase, data.orgId);
    const { createStripeClient, getStripeErrorMessage } = await import("./stripe.server");
    const { readCurrentSubscription, previewChange } = await import("./billing/change.server");

    try {
      const { subscriptionId, customerId } = await liveSubscriptionFor(
        context.supabase,
        data.orgId,
        data.environment,
      );
      const stripe = createStripeClient(data.environment);
      const current = await readCurrentSubscription(stripe, subscriptionId);
      const preview = await previewChange(
        stripe,
        current,
        { plan: data.plan, interval: data.interval },
        customerId,
      );
      return { ok: true, ...preview };
    } catch (error) {
      return { ok: false, error: getStripeErrorMessage(error) };
    }
  });

export type PlanChangeResult =
  | (import("./billing/change.server").AppliedChange & { ok: true })
  | { ok: false; error: string };

export const changeWorkspacePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validatePlanChangeInput)
  .handler(async ({ data, context }): Promise<PlanChangeResult> => {
    // Only a manager may move the money. RLS already scopes the workspace; this
    // is the authority on top of membership.
    await assertManager(context.supabase, data.orgId);

    const { createStripeClient, getStripeErrorMessage } = await import("./stripe.server");
    const { readCurrentSubscription, applyChange } = await import("./billing/change.server");

    try {
      const { subscriptionId } = await liveSubscriptionFor(
        context.supabase,
        data.orgId,
        data.environment,
      );
      const stripe = createStripeClient(data.environment);
      const current = await readCurrentSubscription(stripe, subscriptionId);
      const applied = await applyChange(
        stripe,
        current,
        { plan: data.plan, interval: data.interval },
        { orgId: data.orgId, userId: context.userId },
        data.environment,
      );
      // The recorded level still follows the signed webhook, never this call:
      // an immediate upgrade lands as `customer.subscription.updated`, and a
      // booked downgrade lands at the boundary. Nothing here writes the plan.
      return { ok: true, ...applied };
    } catch (error) {
      return { ok: false, error: getStripeErrorMessage(error) };
    }
  });

/** Drops a downgrade (or interval change) that was booked for the boundary. */
export const cancelPlanChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orgId: string; environment: Env }) => {
    if (!UUID.test(data?.orgId ?? "")) throw new Error("Unknown workspace");
    return { orgId: data.orgId, environment: validEnv(data.environment) };
  })
  .handler(async ({ data, context }): Promise<{ ok: true } | { ok: false; error: string }> => {
    await assertManager(context.supabase, data.orgId);
    const { createStripeClient, getStripeErrorMessage } = await import("./stripe.server");
    const { readCurrentSubscription, cancelScheduledChange } = await import(
      "./billing/change.server"
    );
    try {
      const { subscriptionId } = await liveSubscriptionFor(
        context.supabase,
        data.orgId,
        data.environment,
      );
      const stripe = createStripeClient(data.environment);
      const current = await readCurrentSubscription(stripe, subscriptionId);
      await cancelScheduledChange(stripe, current);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: getStripeErrorMessage(error) };
    }
  });

export type { SubscriptionState };

export interface InvoiceRow {
  id: string;
  number: string | null;
  status: string | null;
  amountPaidUsd: number;
  currency: string;
  createdIso: string;
  hostedUrl: string | null;
  pdfUrl: string | null;
}

/**
 * Invoice history for the workspace, read straight from the payment provider.
 *
 * We deliberately do not mirror invoices into our own tables: the provider is
 * the record of what was charged, and a stale copy of a receipt is worse than
 * no copy at all.
 *
 * Two narrowings, both deliberate. Managers only: a receipt carries the legal
 * entity, the billing address and the VAT id, which is not ordinary-member
 * information. And the list is filtered to this workspace's own subscription
 * rather than everything on the customer, so even a customer record that
 * predates the per-workspace split cannot spill another workspace's receipts.
 */
export const listWorkspaceInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orgId: string; environment: Env }) => {
    if (!UUID.test(data?.orgId ?? "")) throw new Error("Unknown workspace");
    return { orgId: data.orgId, environment: validEnv(data.environment) };
  })
  .handler(async ({ data, context }): Promise<InvoiceRow[]> => {
    await assertManager(context.supabase, data.orgId);

    const { data: sub } = await context.supabase
      .from("subscriptions")
      .select("stripe_customer_id, stripe_subscription_id")
      .eq("org_id", data.orgId)
      .eq("environment", data.environment)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!sub?.stripe_customer_id) return [];

    const { createStripeClient } = await import("./stripe.server");
    try {
      const stripe = createStripeClient(data.environment);
      const list = await stripe.invoices.list({
        customer: sub.stripe_customer_id as string,
        ...(sub.stripe_subscription_id && {
          subscription: sub.stripe_subscription_id as string,
        }),
        limit: 24,
      });

      return list.data.map((i) => ({
        id: i.id ?? "",
        number: i.number ?? null,
        status: i.status ?? null,
        amountPaidUsd: (i.amount_paid ?? 0) / 100,
        currency: (i.currency ?? "usd").toUpperCase(),
        createdIso: new Date((i.created ?? 0) * 1000).toISOString(),
        hostedUrl: i.hosted_invoice_url ?? null,
        pdfUrl: i.invoice_pdf ?? null,
      }));
    } catch {
      // A billing page that 500s is worse than one that says "no receipts yet".
      return [];
    }
  });
