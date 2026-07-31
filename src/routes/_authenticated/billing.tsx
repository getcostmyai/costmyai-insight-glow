import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";

import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { PlanCheckout } from "@/components/billing/PlanCheckout";
import { PlanPicker } from "@/components/billing/PlanPicker";
import { getWorkspaceBilling } from "@/lib/billing.functions";
import type { BillingInterval } from "@/lib/billing/catalog";
import { PLAN_META, type PlanTier } from "@/lib/engine/types";
import { getStripeEnvironment } from "@/lib/stripe";
import { listMyWorkspaces } from "@/lib/workspace.functions";

export const Route = createFileRoute("/_authenticated/billing")({
  validateSearch: (search: Record<string, unknown>): { session_id?: string } => ({
    session_id: typeof search["session_id"] === "string" ? search["session_id"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Choose your rung — CostMyAI" },
      {
        name: "description",
        content:
          "Compare is free. Certify, Rightsize and Govern unlock quality-matched switches, oversized-workload detection and autonomous switching.",
      },
      { property: "og:title", content: "Choose your rung — CostMyAI" },
      {
        property: "og:description",
        content: "Four rungs, priced as sold: Compare free, Certify, Rightsize and Govern paid.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BillingPage,
});

function BillingPage() {
  const { session_id: sessionId } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [checkoutPlan, setCheckoutPlan] = useState<PlanTier | null>(null);
  const [error, setError] = useState<string | null>(null);

  const workspaces = useQuery({
    queryKey: ["my-workspaces"],
    queryFn: () => listMyWorkspaces(),
    staleTime: 30_000,
  });
  const org = workspaces.data?.[0];

  const billing = useQuery({
    queryKey: ["workspace-billing", org?.id, sessionId],
    enabled: Boolean(org?.id),
    queryFn: () =>
      getWorkspaceBilling({
        data: { orgId: org!.id, environment: getStripeEnvironment() },
      }),
    // After a checkout the plan lands via the payment webhook, so keep looking
    // until the workspace record catches up rather than claiming success early.
    refetchInterval: (q) =>
      sessionId && q.state.data?.effectivePlan === "compare" ? 2_000 : false,
  });

  if (workspaces.isPending) return <Centered>Loading your workspace…</Centered>;
  if (!org) {
    return (
      <Centered>
        <Link to="/workspace" className="text-primary underline">
          Name your workspace first
        </Link>
      </Centered>
    );
  }

  const current = billing.data?.effectivePlan ?? "compare";
  const returnUrl = `${typeof window === "undefined" ? "" : window.location.origin}/billing?session_id={CHECKOUT_SESSION_ID}`;

  async function choose(plan: PlanTier) {
    setError(null);
    if (plan === "compare") {
      navigate({ to: "/workspace" });
      return;
    }
    setCheckoutPlan(plan);
  }

  if (sessionId && checkoutPlan === null) {
    const settled = current !== "compare";
    return (
      <main className="min-h-screen bg-background">
        <PaymentTestModeBanner />
        <div className="mx-auto flex max-w-xl flex-col items-center px-6 py-24 text-center">
          {settled ? (
            <>
              <CheckCircle2 className="size-10 text-saving" />
              <h1 className="mt-4 text-xl font-semibold tracking-tight">
                {PLAN_META[current].label} is live on {org.name}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {PLAN_META[current].blurb} Your workspace is provisioned on this rung now.
              </p>
              <button
                onClick={() => {
                  queryClient.invalidateQueries({ queryKey: ["my-workspaces"] });
                  navigate({ to: "/workspace" });
                }}
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
              >
                Go to your workspace
                <ArrowRight className="size-4" />
              </button>
            </>
          ) : (
            <>
              <Loader2 className="size-8 animate-spin text-primary" />
              <h1 className="mt-4 text-lg font-semibold tracking-tight">Confirming your payment</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                We upgrade the workspace only once the payment provider confirms the subscription.
                This takes a few seconds.
              </p>
            </>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <PaymentTestModeBanner />
      <div className="mx-auto max-w-6xl px-6 py-16">
        <p className="eyebrow">{org.name}</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Choose your rung</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Every rung runs on your own measured traffic. Compare is free forever. The paid rungs add
          the checks and the switching that turn those findings into money off the bill.
        </p>

        {error ? <p className="mt-6 text-sm text-destructive">{error}</p> : null}

        {checkoutPlan ? (
          <div className="mt-10">
            <button
              onClick={() => setCheckoutPlan(null)}
              className="mb-4 text-xs text-muted-foreground hover:text-foreground"
            >
              ← Back to plans
            </button>
            <PlanCheckout
              orgId={org.id}
              plan={checkoutPlan}
              interval={interval}
              returnUrl={returnUrl}
            />
          </div>
        ) : (
          <div className="mt-10">
            <PlanPicker
              interval={interval}
              onIntervalChange={setInterval}
              currentPlan={current}
              onSelect={choose}
              busyPlan={null}
            />
            <p className="mt-8 text-center text-xs text-muted-foreground">
              Prices are per workspace. Cancel any time — you keep the rung until the period you
              paid for ends.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6 text-sm text-muted-foreground">
      {children}
    </div>
  );
}
