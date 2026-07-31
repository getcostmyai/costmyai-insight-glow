import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";

import { createPlanCheckout } from "@/lib/billing.functions";
import type { BillingInterval } from "@/lib/billing/catalog";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import type { PlanTier } from "@/lib/engine/types";

export function PlanCheckout({
  orgId,
  plan,
  interval,
  returnUrl,
}: {
  orgId: string;
  plan: PlanTier;
  interval: BillingInterval;
  returnUrl: string;
}) {
  const fetchClientSecret = async (): Promise<string> => {
    const result = await createPlanCheckout({
      data: { orgId, plan, interval, returnUrl, environment: getStripeEnvironment() },
    });
    if ("error" in result) throw new Error(result.error);
    if (!result.clientSecret) throw new Error("Checkout did not start. Try again in a moment.");
    return result.clientSecret;
  };

  return (
    <div id="checkout" className="rounded-2xl border border-border bg-card p-2">
      <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
