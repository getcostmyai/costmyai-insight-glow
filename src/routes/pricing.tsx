import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Check, Minus } from "lucide-react";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PLAN_META } from "@/lib/engine/types";
import type { PlanTier } from "@/lib/engine/types";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — CostMyAI" },
      {
        name: "description",
        content:
          "Compare is free forever. Certify adds quality-matched model switches, Rightsize adds oversized-workload detection, Govern switches autonomously inside the equivalence band.",
      },
      { property: "og:title", content: "Pricing — CostMyAI" },
      {
        property: "og:description",
        content:
          "Four levels, one path: Compare free, then Certify, Rightsize and Govern. No provider keys, no placement fees.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PricingPage,
});

const ORDER: PlanTier[] = ["compare", "certify", "rightsize", "govern"];

const INCLUDES: Record<PlanTier, string[]> = {
  compare: [
    "Same model, cheaper host — across every priced host",
    "Live gateway metadata ingestion (metadata only)",
    "Spend, tokens and requests over 24h / 7d / 30d",
    "One workspace member",
  ],
  certify: [
    "Everything in Compare",
    "Quality-matched cheaper models, cheapest that clears the bar",
    "Published evaluation, score and measurement margin per claim",
    "Refusals with reasons when nothing clears",
  ],
  rightsize: [
    "Everything in Certify",
    "Oversized-workload detection per task class",
    "Manual switch activation, pause and one-click rollback",
    "Objectives: cost, latency ceiling, quality floor",
    "Team members and invites",
  ],
  govern: [
    "Everything in Rightsize",
    "Autonomous switching inside the equivalence band",
    "Continuous re-evaluation as prices and scores move",
    "Full audit trail of every automated decision",
    "Invoice reconciliation you push to us",
  ],
};

function PricingPage() {
  const [yearly, setYearly] = useState(false);

  return (
    <MarketingShell>
      <section className="wash-hero">
        <div className="mx-auto max-w-6xl px-5 pb-16 pt-20 text-center sm:px-8 sm:pt-24">
          <p className="eyebrow">Pricing</p>
          <h1 className="mt-3 text-4xl font-bold tracking-[-0.03em] sm:text-5xl">
            Pay for the level you're on.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
            Compare is free forever — it finds the cheapest host for models you already run. Every
            paid level includes the ones beneath it.
          </p>

          <div className="mt-8 inline-flex items-center gap-1 rounded-full border border-border bg-card p-1">
            <BillingToggle active={!yearly} onClick={() => setYearly(false)}>
              Monthly
            </BillingToggle>
            <BillingToggle active={yearly} onClick={() => setYearly(true)}>
              Yearly
              <span className="ml-1.5 rounded-full bg-saving-soft px-2 py-0.5 text-[11px] font-semibold text-saving">
                2 months free
              </span>
            </BillingToggle>
          </div>
        </div>
      </section>

      <section className="px-5 pb-24 sm:px-8">
        <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-4">
          {ORDER.map((plan) => {
            const meta = PLAN_META[plan];
            const price = yearly ? meta.yearly : meta.monthly;
            const featured = plan === "rightsize";

            return (
              <div
                key={plan}
                className={`relative flex flex-col rounded-3xl border p-7 ${
                  featured
                    ? "border-primary/45 bg-card shadow-[var(--shadow-float)]"
                    : "border-border bg-card shadow-[var(--shadow-card)]"
                }`}
              >
                {featured ? (
                  <span className="absolute -top-3 left-7 rounded-full fill-gradient-brand px-3 py-1 text-[11px] font-semibold text-primary-foreground">
                    Most chosen
                  </span>
                ) : null}

                <p className="text-sm font-semibold tracking-tight">{meta.label}</p>
                <p className="mt-4">
                  <span className="num text-4xl">{price === 0 ? "Free" : `$${price}`}</span>
                  {price === 0 ? null : (
                    <span className="text-sm font-medium text-muted-foreground"> /mo</span>
                  )}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {price === 0
                    ? "No card required"
                    : yearly
                      ? "billed yearly"
                      : "billed monthly, cancel anytime"}
                </p>

                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{meta.blurb}</p>

                <Link
                  to="/auth"
                  className={`mt-6 w-full px-5 py-2.5 text-sm ${featured ? "btn-gradient" : "btn-quiet"}`}
                >
                  {price === 0 ? "Start free" : `Start ${meta.label}`}
                  <ArrowRight className="h-4 w-4" />
                </Link>

                <ul className="mt-7 space-y-3 border-t border-border pt-6">
                  {INCLUDES[plan].map((line) => (
                    <li key={line} className="flex items-start gap-2.5">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-saving" />
                      <span className="text-sm leading-relaxed text-muted-foreground">{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <div className="mx-auto mt-14 max-w-3xl space-y-3">
          <Faq
            q="Do you ever hold our provider API keys?"
            a="No. The ingest container runs beside your stack and pushes metadata only. There is nowhere in our system for a provider key to live, and we cannot call your providers on your behalf."
          />
          <Faq
            q="Does a provider pay you to be recommended?"
            a="No. There is no placement fee, ranking fee or revenue share from any host or model vendor. The cheapest option clearing the measured quality bar wins, and ties break on cost then alphabetically."
          />
          <Faq
            q="What happens when nothing clears the quality bar?"
            a="You see the refusal and the reason — which evaluation was used, what the scores were, and how wide the measurement margin is. We do not fall back to a weaker suggestion to fill the screen."
          />
          <Faq
            q="Can we switch back?"
            a="Every switch is one click to roll back on Rightsize and above, and Govern's autonomous switches stay inside the equivalence band and are fully audited."
          />
        </div>
      </section>
    </MarketingShell>
  );
}

function BillingToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-medium transition-colors ${
        active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-start gap-3">
        <Minus className="mt-1 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="font-semibold tracking-tight">{q}</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{a}</p>
        </div>
      </div>
    </div>
  );
}
