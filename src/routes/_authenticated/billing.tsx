import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, CheckCircle2, ExternalLink, Loader2, Receipt } from "lucide-react";

import { AccountShell } from "@/components/dashboard/AccountShell";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { PlanCheckout } from "@/components/billing/PlanCheckout";
import { PlanPicker } from "@/components/billing/PlanPicker";
import {
  createBillingPortal,
  getWorkspaceBilling,
  listWorkspaceInvoices,
} from "@/lib/billing.functions";
import type { BillingInterval } from "@/lib/billing/catalog";
import { usd } from "@/lib/dashboard-data";
import { PLAN_META, type PlanTier } from "@/lib/engine/types";
import { getStripeEnvironment } from "@/lib/stripe";
import { listMyWorkspaces } from "@/lib/workspace.functions";

export const Route = createFileRoute("/_authenticated/billing")({
  validateSearch: (search: Record<string, unknown>): { session_id?: string } => ({
    session_id: typeof search["session_id"] === "string" ? search["session_id"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Billing — CostMyAI" },
      {
        name: "description",
        content:
          "Your workspace subscription, renewal date, payment method and receipts — plus the levels you have not unlocked yet.",
      },
      { property: "og:title", content: "Billing — CostMyAI" },
      {
        property: "og:description",
        content: "Subscription status, invoice history and level upgrades for your workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BillingPage,
});

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

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

  const invoices = useQuery({
    queryKey: ["workspace-invoices", org?.id],
    enabled: Boolean(org?.id),
    queryFn: () =>
      listWorkspaceInvoices({ data: { orgId: org!.id, environment: getStripeEnvironment() } }),
    staleTime: 60_000,
  });

  const portal = useMutation({
    mutationFn: () =>
      createBillingPortal({
        data: {
          orgId: org!.id,
          environment: getStripeEnvironment(),
          returnUrl: typeof window === "undefined" ? undefined : `${window.location.origin}/billing`,
        },
      }),
    onSuccess: (result) => {
      if ("error" in result) {
        setError(result.error);
        return;
      }
      window.open(result.url, "_blank");
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : "The billing portal could not be opened."),
  });

  if (workspaces.isPending) {
    return (
      <AccountShell active="billing" title="Billing">
        <p className="text-sm text-muted-foreground">Loading your workspace…</p>
      </AccountShell>
    );
  }
  if (!org) {
    return (
      <AccountShell active="billing" title="Billing">
        <Link to="/workspace" className="text-sm text-primary underline">
          Name your workspace first
        </Link>
      </AccountShell>
    );
  }

  const current = billing.data?.effectivePlan ?? "compare";
  const status = billing.data?.status ?? null;
  const returnUrl = `${typeof window === "undefined" ? "" : window.location.origin}/billing?session_id={CHECKOUT_SESSION_ID}`;

  async function choose(plan: PlanTier) {
    setError(null);
    if (plan === "compare") {
      navigate({ to: "/workspace" });
      return;
    }
    setCheckoutPlan(plan);
  }

  // Returning from checkout: the webhook, not the browser, decides when the
  // level is live, so this waits for the workspace record to change.
  if (sessionId && checkoutPlan === null) {
    const settled = current !== "compare";
    return (
      <AccountShell active="billing" title="Billing">
        <PaymentTestModeBanner />
        <div className="flex flex-col items-center py-16 text-center">
          {settled ? (
            <>
              <CheckCircle2 className="size-10 text-saving" />
              <h2 className="mt-4 text-xl font-semibold tracking-tight">
                {PLAN_META[current].label} is live on {org.name}
              </h2>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                {PLAN_META[current].blurb} Your workspace is provisioned on this level now.
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
              <h2 className="mt-4 text-lg font-semibold tracking-tight">Confirming your payment</h2>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                We upgrade the workspace only once the payment provider confirms the subscription.
                This takes a few seconds.
              </p>
            </>
          )}
        </div>
      </AccountShell>
    );
  }

  return (
    <AccountShell
      active="billing"
      title="Billing"
      intro={`What ${org.name} is on today, what it renews at, and every receipt the payment provider has issued.`}
    >
      <PaymentTestModeBanner />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {/* Current subscription */}
      <section className="card-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="eyebrow">Current level</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">
              {PLAN_META[current].label}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{PLAN_META[current].blurb}</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            <Fact
              label="Status"
              value={current === "compare" ? "Free — no subscription" : (status ?? "unknown")}
            />
            <Fact
              label={billing.data?.cancelAtPeriodEnd ? "Access until" : "Renews"}
              value={
                billing.data?.currentPeriodEnd ? fmtDate(billing.data.currentPeriodEnd) : "—"
              }
            />
            <Fact
              label="Price"
              value={
                current === "compare"
                  ? "$0"
                  : `${usd(PLAN_META[current].monthly, 0)}/mo`
              }
            />
          </div>
        </div>
        {billing.data?.cancelAtPeriodEnd ? (
          <p className="mt-4 rounded-xl bg-opportunity-soft p-3 text-sm text-opportunity">
            This subscription is set to cancel. You keep {PLAN_META[current].label} until the date
            above, then the workspace returns to Compare.
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={portal.isPending || current === "compare"}
            onClick={() => portal.mutate()}
            className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold transition-colors hover:bg-muted disabled:opacity-50"
          >
            {portal.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Manage payment method & cancellation
            <ExternalLink className="size-3.5" />
          </button>
          <Link
            to="/workspace"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Back to dashboard
            <ArrowRight className="size-4" />
          </Link>
        </div>
        {current === "compare" ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Compare is free, so there is no payment method to manage yet.
          </p>
        ) : null}
      </section>

      {/* Invoice history */}
      <section className="card-surface overflow-hidden">
        <div className="flex items-center gap-3 border-b border-border p-6">
          <Receipt className="size-4 text-muted-foreground" />
          <p className="text-sm font-semibold">Invoice history</p>
        </div>
        {invoices.isPending ? (
          <p className="p-6 text-sm text-muted-foreground">Loading receipts…</p>
        ) : (invoices.data?.length ?? 0) === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            No invoices yet. Receipts appear here the moment the provider issues one.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {invoices.data!.map((inv) => (
              <div key={inv.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 p-5">
                <span className="num text-sm text-muted-foreground">{fmtDate(inv.createdIso)}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {inv.number ?? inv.id}
                </span>
                <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                  {inv.status ?? "—"}
                </span>
                <span className="num ml-auto text-sm">
                  {usd(inv.amountPaidUsd)} {inv.currency}
                </span>
                {inv.hostedUrl ? (
                  <a
                    href={inv.hostedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary"
                  >
                    View
                    <ExternalLink className="size-3" />
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Upgrade entry point */}
      <section>
        <p className="eyebrow">Change level</p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight">
          Every level runs on your own measured traffic
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Compare is free forever. The paid levels add the checks and the switching that turn those
          findings into money off the bill.
        </p>
        <div className="mt-6">
          {checkoutPlan ? (
            <>
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
            </>
          ) : (
            <PlanPicker
              interval={interval}
              onIntervalChange={setInterval}
              currentPlan={current}
              onSelect={choose}
              busyPlan={null}
            />
          )}
        </div>
      </section>
    </AccountShell>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <p className="num mt-1 text-sm">{value}</p>
    </div>
  );
}
