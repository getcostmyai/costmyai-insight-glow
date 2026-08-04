import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import type { PlanTier } from "./engine/types";
import { PAID_PLANS, priceIdFor, type BillingInterval } from "./billing/catalog";
import { effectivePlan, type SubscriptionState } from "./billing/entitlement";

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

export interface WorkspaceBilling {
  orgId: string;
  recordedPlan: PlanTier;
  /** What the workspace may actually use — the plan gate's answer. */
  effectivePlan: PlanTier;
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export const getWorkspaceBilling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orgId: string; environment: Env }) => {
    if (!UUID.test(data?.orgId ?? "")) throw new Error("Unknown workspace");
    return { orgId: data.orgId, environment: validEnv(data.environment) };
  })
  .handler(async ({ data, context }): Promise<WorkspaceBilling> => {
    const { loadPlanState } = await import("./billing/guard.server");
    const state = await loadPlanState(context.supabase, data.orgId, data.environment);
    return {
      orgId: data.orgId,
      recordedPlan: state.plan,
      effectivePlan: effectivePlan(state.plan, state.subscription),
      status: state.subscription?.status ?? null,
      currentPeriodEnd: state.subscription?.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: state.subscription?.cancelAtPeriodEnd ?? false,
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
 */
export const listWorkspaceInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orgId: string; environment: Env }) => {
    if (!UUID.test(data?.orgId ?? "")) throw new Error("Unknown workspace");
    return { orgId: data.orgId, environment: validEnv(data.environment) };
  })
  .handler(async ({ data, context }): Promise<InvoiceRow[]> => {
    const { data: sub } = await context.supabase
      .from("subscriptions")
      .select("stripe_customer_id")
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
