import { Check, Sparkles } from "lucide-react";

import { monthlyRate, type BillingInterval } from "@/lib/billing/catalog";
import { PLAN_META, PLAN_ORDER, type PlanTier } from "@/lib/engine/types";

/**
 * The four levels, priced as they are actually sold. Compare is free and always
 * available; the rest are paid from day one.
 */

const WHAT_YOU_GET: Record<PlanTier, string[]> = {
  compare: ["Same model, cheaper host", "Measured from your own traffic", "Unlimited workloads"],
  certify: ["Everything in Compare", "Quality-matched cheaper models", "Benchmark-backed equivalence"],
  rightsize: [
    "Everything in Certify",
    "Oversized-workload detection",
    "Manual switching",
    "Objective selection",
  ],
  govern: ["Everything in Rightsize", "Autonomous switching by CostMyAI", "Billing reconciliation"],
};

export function PlanPicker({
  interval,
  onIntervalChange,
  currentPlan,
  onSelect,
  busyPlan,
}: {
  interval: BillingInterval;
  onIntervalChange: (i: BillingInterval) => void;
  currentPlan: PlanTier;
  onSelect: (plan: PlanTier) => void;
  busyPlan: PlanTier | null;
}) {
  return (
    <div>
      <div className="flex justify-center">
        <div className="flex gap-1 rounded-full bg-muted p-1 text-xs font-medium">
          {(["monthly", "yearly"] as BillingInterval[]).map((i) => (
            <button
              key={i}
              onClick={() => onIntervalChange(i)}
              aria-pressed={i === interval}
              className={`rounded-full px-4 py-1.5 transition-colors ${
                i === interval
                  ? "bg-card text-primary shadow-[var(--shadow-card)]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {i === "monthly" ? "Monthly" : "Yearly — save ~16%"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-4">
        {PLAN_ORDER.map((plan) => {
          const meta = PLAN_META[plan];
          const rate = monthlyRate(plan, interval);
          const isCurrent = plan === currentPlan;
          const free = plan === "compare";
          const featured = plan === "rightsize";
          return (
            <div
              key={plan}
              className={`relative flex flex-col rounded-2xl border p-6 ${
                featured
                  ? "border-primary/40 bg-card shadow-[var(--shadow-card)]"
                  : "border-border bg-card"
              }`}
            >
              {featured ? (
                <span className="absolute -top-2.5 left-6 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                  Most chosen
                </span>
              ) : null}
              <p className="text-sm font-semibold">{meta.label}</p>
              <p className="mt-1 min-h-10 text-xs text-muted-foreground">{meta.blurb}</p>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="num text-3xl">{free ? "Free" : `$${rate}`}</span>
                {!free ? (
                  <span className="text-xs text-muted-foreground">
                    /mo{interval === "yearly" ? ", billed yearly" : ""}
                  </span>
                ) : null}
              </div>
              <ul className="mt-5 flex-1 space-y-2">
                {WHAT_YOU_GET[plan].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-saving" />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                disabled={isCurrent || busyPlan !== null}
                onClick={() => onSelect(plan)}
                className={`mt-6 inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-transform disabled:opacity-60 ${
                  featured || !free
                    ? "bg-primary text-primary-foreground hover:scale-[1.02] active:scale-95"
                    : "border border-border text-foreground hover:bg-muted"
                }`}
              >
                {!free && !isCurrent ? <Sparkles className="size-4" /> : null}
                {isCurrent
                  ? "Current plan"
                  : busyPlan === plan
                    ? "Opening checkout…"
                    : free
                      ? "Continue on Compare"
                      : `Choose ${meta.label}`}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
