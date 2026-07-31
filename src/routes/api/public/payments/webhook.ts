import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

import { PLAN_BY_PRICE_ID } from "@/lib/billing/catalog";
import { type StripeEnv, verifyWebhook } from "@/lib/stripe.server";

/**
 * The only thing in the system that may move a workspace onto a paid rung.
 *
 * Nothing here trusts the browser: the request is rejected unless it carries a
 * valid provider signature, and the workspace is identified from metadata the
 * server itself stamped onto the subscription at checkout.
 */

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env["SUPABASE_URL"]!,
      process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
    );
  }
  return _supabase;
}

function planFromSubscription(subscription: any): {
  plan: string | null;
  priceId: string | null;
  productId: string | null;
} {
  const item = subscription.items?.data?.[0];
  const priceId =
    item?.price?.lookup_key || item?.price?.metadata?.lovable_external_id || item?.price?.id || null;
  const plan = priceId ? (PLAN_BY_PRICE_ID[priceId] ?? null) : null;
  return { plan, priceId, productId: item?.price?.product ?? null };
}

function isoFrom(seconds: number | null | undefined): string | null {
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

/** Statuses where the workspace still gets the rung it paid for. */
function grantsAccess(status: string, periodEnd: string | null): boolean {
  const future = periodEnd === null || new Date(periodEnd).getTime() > Date.now();
  if (["active", "trialing", "past_due"].includes(status)) return future;
  if (status === "canceled") return periodEnd !== null && new Date(periodEnd).getTime() > Date.now();
  return false;
}

async function syncSubscription(subscription: any, env: StripeEnv) {
  const orgId = subscription.metadata?.orgId;
  const userId = subscription.metadata?.userId ?? null;
  if (!orgId) {
    console.error("Subscription without orgId metadata:", subscription.id);
    return;
  }

  const { plan, priceId, productId } = planFromSubscription(subscription);
  if (!plan || !priceId) {
    console.error("Subscription with unrecognised price:", subscription.id, priceId);
    return;
  }

  const item = subscription.items?.data?.[0];
  const periodStart = isoFrom(item?.current_period_start ?? subscription.current_period_start);
  const periodEnd = isoFrom(item?.current_period_end ?? subscription.current_period_end);
  const status = subscription.status as string;

  await getSupabase()
    .from("subscriptions")
    .upsert(
      {
        org_id: orgId,
        user_id: userId,
        stripe_subscription_id: subscription.id,
        stripe_customer_id:
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer?.id,
        product_id: productId,
        price_id: priceId,
        plan,
        status,
        current_period_start: periodStart,
        current_period_end: periodEnd,
        cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
        environment: env,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "stripe_subscription_id" },
    );

  // The workspace record follows the subscription, in both directions. When
  // the paid period is genuinely over the workspace goes back to Compare —
  // there is no grace beyond what was paid for.
  await getSupabase()
    .from("organizations")
    .update({
      plan: grantsAccess(status, periodEnd) ? plan : "compare",
      stripe_customer_id:
        typeof subscription.customer === "string"
          ? subscription.customer
          : (subscription.customer?.id ?? null),
      stripe_subscription_id: subscription.id,
      plan_valid_until: periodEnd,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orgId);
}

async function handleWebhook(req: Request, env: StripeEnv) {
  const event = await verifyWebhook(req, env);

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await syncSubscription(event.data.object, env);
      break;
    case "customer.subscription.deleted":
      await syncSubscription({ ...event.data.object, status: "canceled" }, env);
      break;
    case "checkout.session.completed":
    case "invoice.paid":
      // Subscription state is carried by the customer.subscription.* events.
      break;
    default:
      console.log("Unhandled payment event:", event.type);
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          console.error("Payment webhook with invalid env:", rawEnv);
          return Response.json({ received: true, ignored: "invalid env" });
        }
        try {
          await handleWebhook(request, rawEnv);
          return Response.json({ received: true });
        } catch (e) {
          console.error("Payment webhook error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
