import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, Loader2 } from "lucide-react";

import { ErrorState } from "@/components/ErrorState";
import { changeWorkspacePlan, previewPlanChange } from "@/lib/billing.functions";
import type { BillingInterval } from "@/lib/billing/catalog";
import { monthlyRate } from "@/lib/billing/catalog";
import { usd } from "@/lib/dashboard-data";
import { PLAN_META, type PlanTier } from "@/lib/engine/types";
import { getStripeEnvironment } from "@/lib/stripe";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/**
 * The confirmation a paying workspace sees before its level moves.
 *
 * Every number on it comes from the payment provider's own quote, and the
 * sentence describing what happens is derived from the same classification the
 * server will act on — so the page cannot promise one thing and the invoice do
 * another.
 */
export function PlanChangeConfirm({
  orgId,
  plan,
  interval,
  onCancel,
  onDone,
}: {
  orgId: string;
  plan: PlanTier;
  interval: BillingInterval;
  onCancel: () => void;
  onDone: () => void;
}) {
  const environment = getStripeEnvironment();

  const quote = useQuery({
    queryKey: ["plan-change-quote", orgId, plan, interval, environment],
    queryFn: () => previewPlanChange({ data: { orgId, plan, interval, environment } }),
    staleTime: 0,
  });

  const apply = useMutation({
    mutationFn: () => changeWorkspacePlan({ data: { orgId, plan, interval, environment } }),
    onSuccess: (result) => {
      if (result.ok) onDone();
    },
  });

  const meta = PLAN_META[plan];
  const rate = monthlyRate(plan, interval);

  if (quote.isPending) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Asking the payment provider what this change costs…
      </div>
    );
  }

  if (quote.isError) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <ErrorState error={quote.error} onRetry={() => quote.refetch()} retrying={quote.isFetching} />
      </div>
    );
  }

  if (!quote.data.ok) {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-card p-6">
        <p className="text-sm text-destructive">{quote.data.error}</p>
        <button onClick={onCancel} className="mt-4 text-xs text-muted-foreground hover:text-foreground">
          ← Back to plans
        </button>
      </div>
    );
  }

  const q = quote.data;
  const applyError = apply.data && !apply.data.ok ? apply.data.error : null;

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <p className="eyebrow">{q.kind === "upgrade" ? "Upgrade" : q.kind === "downgrade" ? "Downgrade" : "No change"}</p>
      <div className="mt-2 flex flex-wrap items-baseline gap-3 text-lg font-semibold tracking-tight">
        <span>{PLAN_META[q.currentPlan].label}</span>
        <ArrowRight className="size-4 text-muted-foreground" />
        <span>{meta.label}</span>
        <span className="num text-sm text-muted-foreground">
          {usd(rate, 0)}/mo{interval === "yearly" ? ", billed yearly" : ""}
        </span>
      </div>

      {q.kind === "upgrade" ? (
        <div className="mt-4 space-y-2 text-sm text-foreground">
          <p>
            {meta.label} opens <span className="font-semibold">immediately</span>. You are credited
            for the unused part of {PLAN_META[q.currentPlan].label} and charged the prorated
            remainder of {meta.label}.
          </p>
          <p className="text-muted-foreground">
            {q.nextInvoiceTotalUsd !== null
              ? `The payment provider quotes ${usd(q.nextInvoiceTotalUsd)} ${q.currency} for your next invoice: the part-period difference for this change plus the next period. Nothing is charged today.`
              : `The provider could not quote the prorated amount right now${
                  q.quoteUnavailableReason ? ` (${q.quoteUnavailableReason})` : ""
                }. The change is still prorated; the exact figure will appear on your next invoice.`}
          </p>
        </div>
      ) : null}

      {q.kind === "downgrade" ? (
        <div className="mt-4 space-y-2 text-sm text-foreground">
          <p>
            You keep {PLAN_META[q.currentPlan].label} for the period you have already paid for.{" "}
            {meta.label} starts{" "}
            <span className="font-semibold">
              {q.effectiveIso ? `on ${fmtDate(q.effectiveIso)}` : "at the end of this period"}
            </span>
            , and that is when the new price first applies.
          </p>
          <p className="text-muted-foreground">
            Nothing is charged today and nothing is refunded — no access you have paid for is taken
            away early.
          </p>
        </div>
      ) : null}

      {q.kind === "noop" ? (
        <p className="mt-4 text-sm text-muted-foreground">
          This workspace is already on {meta.label}
          {interval === "yearly" ? ", billed yearly" : ""}. Confirming clears any change booked for
          the end of this period.
        </p>
      ) : null}

      {applyError ? <p className="mt-4 text-sm text-destructive">{applyError}</p> : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={apply.isPending}
          onClick={() => apply.mutate()}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {apply.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          {q.kind === "upgrade"
            ? `Upgrade to ${meta.label} now`
            : q.kind === "downgrade"
              ? `Book ${meta.label} for the renewal`
              : "Keep this plan"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center rounded-full border border-border px-5 py-2.5 text-sm font-semibold hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
