import type Stripe from "stripe";

import type { StripeEnvName } from "./guard.server";

/**
 * One provider customer per workspace, per payment environment — pinned in our
 * own database rather than looked up in the provider's search index.
 *
 * `customers.search` is an eventually-consistent index: a customer created a
 * few seconds ago is not necessarily findable, so two checkouts started in
 * quick succession for the same workspace both missed and both created a
 * customer. That is the exact shape of the duplicate already sitting in
 * test-mode data. The registry table replaces it: `org_stripe_customers` has
 * (org_id, environment) as its primary key, so the database — not application
 * timing — decides which customer a workspace owns. A concurrent loser deletes
 * the customer it just created (nothing is attached to it yet) and adopts the
 * winner's, so the race converges on one record instead of two.
 */
export async function resolveOrgCustomer(
  stripe: Stripe,
  environment: StripeEnvName,
  orgId: string,
  actor: { userId: string; email?: string | undefined },
): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const existing = await supabaseAdmin
    .from("org_stripe_customers")
    .select("stripe_customer_id")
    .eq("org_id", orgId)
    .eq("environment", environment)
    .maybeSingle();
  if (existing.error) throw existing.error;

  if (existing.data?.stripe_customer_id) {
    const id = existing.data.stripe_customer_id as string;
    // A customer deleted in the provider dashboard cannot take a checkout, so
    // the pin is replaced rather than blindly reused.
    const live = await stripe.customers.retrieve(id).catch(() => null);
    if (live && !(live as { deleted?: boolean }).deleted) return id;

    const replacement = await createCustomer(stripe, orgId, actor);
    const repin = await supabaseAdmin
      .from("org_stripe_customers")
      .update({ stripe_customer_id: replacement })
      .eq("org_id", orgId)
      .eq("environment", environment)
      .select("stripe_customer_id")
      .maybeSingle();
    if (repin.error) throw repin.error;
    return replacement;
  }

  const created = await createCustomer(stripe, orgId, actor);

  const claim = await supabaseAdmin
    .from("org_stripe_customers")
    .insert({ org_id: orgId, environment, stripe_customer_id: created })
    .select("stripe_customer_id")
    .maybeSingle();

  if (!claim.error && claim.data?.stripe_customer_id) return created;

  // Lost the claim: someone else pinned a customer for this workspace between
  // our read and our write. Adopt theirs and drop ours.
  const winner = await supabaseAdmin
    .from("org_stripe_customers")
    .select("stripe_customer_id")
    .eq("org_id", orgId)
    .eq("environment", environment)
    .maybeSingle();
  const winnerId = winner.data?.stripe_customer_id as string | undefined;
  if (!winnerId) throw claim.error ?? new Error("Could not pin a billing customer.");

  if (winnerId !== created) {
    await stripe.customers.del(created).catch(() => undefined);
  }
  return winnerId;
}

async function createCustomer(
  stripe: Stripe,
  orgId: string,
  actor: { userId: string; email?: string | undefined },
): Promise<string> {
  const customer = await stripe.customers.create({
    ...(actor.email ? { email: actor.email } : {}),
    metadata: { userId: actor.userId, orgId },
  });
  return customer.id;
}
