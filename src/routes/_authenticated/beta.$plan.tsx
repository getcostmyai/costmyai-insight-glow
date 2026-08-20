import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";

import { AccountShell } from "@/components/dashboard/AccountShell";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { createBetaCheckout } from "@/lib/billing/beta.functions";
import { isBetaPlan } from "@/lib/billing/catalog";
import { PLAN_META, type PlanTier } from "@/lib/engine/types";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { listMyWorkspaces } from "@/lib/workspace.functions";

/**
 * Unlisted beta enrolment. Nothing links here — the URL is handed out by hand.
 */
export const Route = createFileRoute("/_authenticated/beta/$plan")({
  head: () => ({
    meta: [
      { title: "Beta access — CostMyAI" },
      { name: "description", content: "Private beta enrolment for an invited CostMyAI workspace." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Beta access — CostMyAI" },
      { property: "og:description", content: "Private beta enrolment for an invited workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BetaEnrolPage,
});

function BetaEnrolPage() {
  const { plan } = useParams({ from: "/_authenticated/beta/$plan" });
  const workspaces = useQuery({
    queryKey: ["my-workspaces"],
    queryFn: () => listMyWorkspaces(),
    staleTime: 30_000,
  });
  const org = workspaces.data?.[0];

  if (!isBetaPlan(plan as PlanTier)) {
    return (
      <AccountShell active="billing" title="Beta access">
        <p className="text-sm text-muted-foreground">That level has no beta invitation.</p>
      </AccountShell>
    );
  }

  const meta = PLAN_META[plan as PlanTier];

  const fetchClientSecret = async (): Promise<string> => {
    const result = await createBetaCheckout({
      data: {
        orgId: org!.id,
        plan: plan as PlanTier,
        returnUrl: `${window.location.origin}/billing?session_id={CHECKOUT_SESSION_ID}`,
        environment: getStripeEnvironment(),
      },
    });
    if ("error" in result) throw new Error(result.error);
    if (!result.clientSecret) throw new Error("Checkout did not start. Try again in a moment.");
    return result.clientSecret;
  };

  return (
    <AccountShell active="billing" title={`${meta.label} beta`}>
      <PaymentTestModeBanner />
      <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
        {meta.label} is in closed beta. This invitation enrols your workspace at no charge — no card
        is requested. You can leave at any time from billing.
      </p>
      {org ? (
        <div id="checkout" className="mt-6 rounded-2xl border border-border bg-card p-2">
          <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret }}>
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        </div>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">Loading your workspace…</p>
      )}
    </AccountShell>
  );
}
