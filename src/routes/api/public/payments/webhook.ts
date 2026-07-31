import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

import { PLAN_BY_PRICE_ID } from "@/lib/billing/catalog";
import { type StripeEnv, verifyWebhook } from "@/lib/stripe.server";

/**
 * The only thing in the system that may move a workspace onto a paid rung.
 *
 * Nothing here trusts the browser: the request is rejected unless it carries a
 * valid provider signature, and the workspace is identified from metadata the
 * server itself stamped onto the subscription at checkout.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let _supabase: ReturnType<typeof createClient<Database>> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient<Database>(
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
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : (subscription.customer?.id ?? null);

  const subscriptionWrite = await getSupabase()
    .from("subscriptions")
    .upsert(
      {
        org_id: orgId,
        // The plan gate reads this row, so a malformed actor id must not be
        // allowed to sink the whole write — the workspace, not the person, is
        // what the subscription belongs to.
        user_id: UUID.test(userId ?? "") ? userId : null,
        stripe_subscription_id: subscription.id,
        stripe_customer_id: customerId,
        product_id: productId,
        price_id: priceId,
        plan: plan as Database["public"]["Enums"]["plan_tier"],
        status,
        current_period_start: periodStart,
        current_period_end: periodEnd,
        cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
        environment: env,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "stripe_subscription_id" },
    );

  // Fail loudly. A silently dropped subscription row leaves a workspace that
  // paid without the record the plan gate reads, so let the provider retry.
  if (subscriptionWrite.error) {
    throw new Error(`subscriptions write failed: ${subscriptionWrite.error.message}`);
  }


  // The workspace record follows the subscription, in both directions. When
  // the paid period is genuinely over the workspace goes back to Compare —
  // there is no grace beyond what was paid for.
  const orgWrite = await getSupabase()
    .from("organizations")
    .update({
      plan: (grantsAccess(status, periodEnd)
        ? plan
        : "compare") as Database["public"]["Enums"]["plan_tier"],
      stripe_customer_id:
        typeof subscription.customer === "string"
          ? subscription.customer
          : (subscription.customer?.id ?? null),
      stripe_subscription_id: subscription.id,
      plan_valid_until: periodEnd,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orgId);

  if (orgWrite.error) {
    throw new Error(`organizations write failed: ${orgWrite.error.message}`);
  }
}

/**
 * Partner commission accrues off the money that actually moved — a paid
 * invoice, not a subscription state change. The workspace is resolved from the
 * subscription row the server itself wrote, never from anything on the
 * invoice, and the accrual is idempotent per (partner, invoice) so provider
 * retries cannot pay a partner twice.
 */
async function accrueCommission(invoice: any, env: StripeEnv) {
  const subscriptionId =
    typeof invoice.subscription === "string"
      ? invoice.subscription
      : (invoice.subscription?.id ?? invoice.parent?.subscription_details?.subscription ?? null);
  if (!subscriptionId) return;

  const { data: sub } = await getSupabase()
    .from("subscriptions")
    .select("org_id")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();
  if (!sub?.org_id) return;

  const revenue = Number(invoice.amount_paid ?? 0) / 100;
  if (revenue <= 0) return;

  const line = invoice.lines?.data?.[0];
  const { error } = await getSupabase().rpc("accrue_commission", {
    _org_id: sub.org_id,
    _invoice_id: String(invoice.id),
    _revenue_usd: revenue,
    _subscription_id: subscriptionId,
    _period_start: isoFrom(line?.period?.start) ?? undefined,
    _period_end: isoFrom(line?.period?.end) ?? undefined,
    _environment: env,
  });
  if (error) throw new Error(`commission accrual failed: ${error.message}`);
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
    case "invoice.paid":
      await accrueCommission(event.data.object, env);
      break;
    case "checkout.session.completed":
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
