import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { BETA_PRICE_IDS, isBetaPlan } from "./catalog";
import type { PlanTier } from "../engine/types";

/**
 * The unlisted checkout path for the closed Rightsize / Govern beta.
 *
 * Nothing here grants anything. It creates a provider checkout session against
 * an unlisted $0 price and stops; the workspace only moves level when the
 * signed webhook lands and `apply_subscription_event` runs — the exact same
 * pipeline every paid checkout uses. The single difference from the public
 * path is which price id starts the session, and that no card is asked for
 * (`payment_method_collection: "if_required"`, correct for a $0 subscription).
 */

type Env = "sandbox" | "live";

const UUID = /^[0-9a-f-]{36}$/i;

type CheckoutResult = { clientSecret: string } | { error: string };

export const createBetaCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { orgId: string; plan: PlanTier; returnUrl: string; environment: Env }) => {
      if (!UUID.test(data?.orgId ?? "")) throw new Error("Unknown workspace");
      if (!isBetaPlan(data?.plan)) throw new Error("That level has no beta invitation.");
      if (typeof data?.returnUrl !== "string" || !data.returnUrl.startsWith("http")) {
        throw new Error("Invalid return URL");
      }
      if (data?.environment !== "sandbox" && data?.environment !== "live") {
        throw new Error("Unknown payment environment");
      }
      return {
        orgId: data.orgId,
        plan: data.plan,
        returnUrl: data.returnUrl,
        environment: data.environment,
      };
    },
  )
  .handler(async ({ data, context }): Promise<CheckoutResult> => {
    const { createStripeClient, getStripeErrorMessage } = await import("../stripe.server");

    const { data: isManager, error: roleError } = await context.supabase.rpc("is_org_manager", {
      _org_id: data.orgId,
    });
    if (roleError) throw roleError;
    if (!isManager) throw new Error("Only a workspace owner or admin can change the plan.");

    // Same double-billing guard as the public path: a live subscription refuses
    // a second checkout outright.
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
      const live =
        ["active", "trialing", "past_due"].includes(existing.status as string) &&
        (end === null || end > Date.now());
      if (live) {
        return {
          error:
            `This workspace already has an active ${existing.plan} subscription. ` +
            `Cancel it from the billing portal before joining the beta.`,
        };
      }
    }

    try {
      const stripe = createStripeClient(data.environment);
      const lookupKey = BETA_PRICE_IDS[data.plan as "rightsize" | "govern"];
      const prices = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
      if (!prices.data.length) throw new Error("Beta price not found");
      const price = prices.data[0]!;

      const userId = context.userId;
      const email = (context.claims.email as string | undefined) ?? undefined;

      const { resolveOrgCustomer } = await import("./customer.server");
      const customerId = await resolveOrgCustomer(stripe, data.environment, data.orgId, {
        userId,
        email,
      });

      const session = await stripe.checkout.sessions.create({
        line_items: [{ price: price.id, quantity: 1 }],
        mode: "subscription",
        ui_mode: "embedded_page",
        return_url: data.returnUrl,
        customer: customerId,
        payment_method_collection: "if_required",
        managed_payments: { enabled: true },
        metadata: {
          userId,
          orgId: data.orgId,
          plan: data.plan,
          managed_payments: "true",
          beta: "true",
        },
        subscription_data: {
          metadata: { userId, orgId: data.orgId, plan: data.plan, beta: "true" },
        },
      } as any);

      return { clientSecret: session.client_secret ?? "" };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });
