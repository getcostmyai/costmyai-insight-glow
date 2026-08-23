import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Check, ChevronDown, ShieldCheck } from "lucide-react";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Reveal } from "@/components/marketing/Reveal";
import { BOOK_DEMO_URL } from "@/lib/marketing-links";
import { PLAN_META } from "@/lib/engine/types";
import { PLAN_FEATURES } from "@/lib/plan-features";
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

// Feature bullets live in src/lib/plan-features.ts — one list, every surface.


const NEVER_PAY = [
  {
    title: "No placement fees",
    body: "No host, gateway or model vendor can pay to be recommended. The cheapest option clearing the measured quality bar wins — ties break on cost, then alphabetically.",
  },
  {
    title: "No per-seat surprise",
    body: "One price per level. Members and invites are part of Rightsize and above, not a line item that grows every time someone joins.",
  },
  {
    title: "No usage tax on your savings",
    body: "We never take a percentage of what we save you. A flat monthly price means our incentive is to keep proving value, not to inflate a number.",
  },
];

function PricingPage() {
  const [yearly, setYearly] = useState(true);

  return (
    <MarketingShell>
      <Hero yearly={yearly} setYearly={setYearly} />
      <Plans yearly={yearly} />
      <NeverPay />
      <Faq />
      <ClosingCta />
    </MarketingShell>
  );
}

/* ---------------------------------- hero --------------------------------- */

function Hero({ yearly, setYearly }: { yearly: boolean; setYearly: (v: boolean) => void }) {
  return (
    <section className="relative overflow-hidden wash-hero">
      <div className="absolute inset-0 texture-dots opacity-60" aria-hidden />
      <div className="relative mx-auto max-w-4xl px-5 pb-16 pt-24 text-center sm:px-8 sm:pt-36">
        <Reveal
          as="p"
          className="text-[0.7rem] font-medium uppercase tracking-[0.18em] text-muted-foreground"
        >
          Pricing
        </Reveal>

        <Reveal
          delay={80}
          as="h1"
          className="mt-6 text-[2.9rem] font-semibold leading-[0.98] tracking-[-0.045em] sm:text-[4.6rem]"
        >
          Pay for the level <span className="text-gradient-brand">you're on.</span>
        </Reveal>

        <Reveal
          delay={150}
          as="p"
          className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl"
        >
          Compare is free forever — it finds the cheapest host for models you already run. Every paid
          level includes the ones beneath it.
        </Reveal>

        <Reveal delay={220} className="mt-10 flex justify-center">
          <div className="inline-flex items-center gap-1 rounded-full border border-border bg-card p-1">
            <BillingToggle active={yearly} onClick={() => setYearly(true)}>
              Yearly
              <span className="ml-1.5 rounded-full bg-saving-soft px-2 py-0.5 text-[11px] font-semibold text-saving">
                2 months free
              </span>
            </BillingToggle>
            <BillingToggle active={!yearly} onClick={() => setYearly(false)}>
              Monthly
            </BillingToggle>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* --------------------------------- plans --------------------------------- */

function Plans({ yearly }: { yearly: boolean }) {
  return (
    <section className="px-5 pb-28 pt-4 sm:px-8 sm:pb-36">
      <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-4">
        {ORDER.map((plan, i) => {
          const meta = PLAN_META[plan];
          const price = yearly ? meta.yearly : meta.monthly;
          const beta = plan === "rightsize" || plan === "govern";
          const featured = false;

          return (
            <Reveal key={plan} delay={i * 90} className="flex">
              <div
                className={`relative flex w-full flex-col rounded-3xl border p-7 transition-transform duration-500 hover:-translate-y-1 ${
                  featured
                    ? "border-primary/45 bg-card shadow-[var(--shadow-float)]"
                    : "border-border bg-card shadow-[var(--shadow-card)]"
                }`}
              >
                {beta ? (
                  <span className="absolute -top-3 left-7 rounded-full border border-border bg-muted px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Coming soon — closed beta
                  </span>
                ) : null}

                <p className="text-sm font-semibold tracking-tight">{meta.label}</p>
                <p className="mt-4">
                  <span
                    className={`num text-[2.75rem] font-semibold leading-none tracking-[-0.045em] ${
                      featured ? "text-gradient-brand" : "text-foreground"
                    }`}
                  >
                    {price === 0 ? "Free" : `$${price}`}
                  </span>
                  {price === 0 ? null : (
                    <span className="text-sm font-medium text-muted-foreground"> /mo</span>
                  )}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {beta
                    ? "not on sale yet — price shown for reference"
                    : price === 0
                      ? "No card required"
                      : yearly
                        ? "billed yearly"
                        : "billed monthly, cancel anytime"}
                </p>

                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{meta.blurb}</p>

                {beta ? (
                  <p className="mt-6 w-full rounded-full border border-dashed border-border px-5 py-2.5 text-center text-sm text-muted-foreground">
                    In closed beta — invitation only
                  </p>
                ) : (
                  <Link to="/auth" className="btn-quiet mt-6 w-full px-5 py-2.5 text-sm">
                    {price === 0 ? "Start free" : `Start ${meta.label}`}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                )}

                <ul className="mt-7 space-y-3 border-t border-border pt-6">
                  {PLAN_FEATURES[plan].map((line: string) => (
                    <li key={line} className="flex items-start gap-2.5">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-saving" />
                      <span className="text-sm leading-relaxed text-muted-foreground">{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------- never pay -------------------------------- */

function NeverPay() {
  return (
    <section className="border-y border-border bg-card">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
        <SectionHead
          eyebrow="What you never pay for"
          title="The price is the price."
          lead="Three things that are not in the bill, and never will be."
        />

        <div className="mx-auto mt-16 max-w-4xl">
          {NEVER_PAY.map((item, i) => (
            <Reveal
              key={item.title}
              delay={i * 90}
              className="grid gap-3 border-t border-border py-9 sm:grid-cols-[1fr_1.6fr] sm:gap-10 sm:py-11"
            >
              <h3 className="text-xl font-semibold tracking-[-0.03em] sm:text-2xl">{item.title}</h3>
              <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
                {item.body}
              </p>
            </Reveal>
          ))}
          <div className="border-t border-border" />
        </div>

        <Reveal delay={120} className="mx-auto mt-20 max-w-3xl text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-secondary">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <h3 className="mt-6 text-2xl font-semibold tracking-[-0.035em] sm:text-[2rem]">
            Metadata only. Never your prompt content.
          </h3>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Every level runs on the same architecture: the Verification Engine sits in your
            environment and holds your keys there. There is nowhere in our system for a provider key
            to live.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------------------------- faq ---------------------------------- */

const FAQ_ITEMS = [
  {
    q: "Do you ever hold our provider API keys?",
    a: "No. The ingest container runs beside your stack and pushes metadata only. There is nowhere in our system for a provider key to live, and we cannot call your providers on your behalf.",
  },
  {
    q: "Does a provider pay you to be recommended?",
    a: "No. There is no placement fee, ranking fee or revenue share from any host or model vendor. The cheapest option clearing the measured quality bar wins, and ties break on cost then alphabetically.",
  },
  {
    q: "What happens when nothing clears the quality bar?",
    a: "You see the refusal and the reason — which evaluation was used, what the scores were, and how wide the measurement margin is. We do not fall back to a weaker suggestion to fill the screen.",
  },
  {
    q: "Can we switch back?",
    a: "Every switch is one click to roll back on Rightsize and above, and Govern's autonomous switches stay inside the equivalence band and are fully audited.",
  },
];

function Faq() {
  const [open, setOpen] = useState(-1);

  return (
    <section id="faq" className="scroll-mt-24 wash-section">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
        <SectionHead eyebrow="FAQ" title="Before you pick a level." />
        <div className="mx-auto mt-16 max-w-3xl">
          {FAQ_ITEMS.map((item, i) => {
            const isOpen = open === i;
            return (
              <Reveal key={item.q} delay={i * 70} className="border-t border-border">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? -1 : i)}
                  aria-expanded={isOpen}
                  className="group flex w-full items-start gap-6 py-7 text-left"
                >
                  <span className="num shrink-0 pt-1.5 text-[11px] tracking-[0.18em] text-primary">
                    {`0${i + 1}`}
                  </span>
                  <span className="flex-1 text-lg font-semibold tracking-[-0.03em] transition-colors group-hover:text-primary sm:text-xl">
                    {item.q}
                  </span>
                  <ChevronDown
                    className={`mt-1.5 h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-300 ${isOpen ? "rotate-180 text-primary" : ""}`}
                  />
                </button>
                <div
                  className={`grid transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                    isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <p className="overflow-hidden pb-7 pl-[3.1rem] pr-10 text-base leading-relaxed text-muted-foreground">
                    {item.a}
                  </p>
                </div>
              </Reveal>
            );
          })}
          <div className="border-t border-border" />
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ closing cta ------------------------------- */

function ClosingCta() {
  return (
    <section className="px-5 py-24 sm:px-8 sm:py-32">
      <Reveal className="mx-auto max-w-3xl text-center">
        <h2 className="text-[2.4rem] font-semibold leading-[1.02] tracking-[-0.045em] sm:text-[3.6rem]">
          Start on <span className="text-gradient-brand">free.</span> Move up when the savings do.
        </h2>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link to="/auth" className="btn-gradient px-6 py-3 text-[15px]">
            Start free
            <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href={BOOK_DEMO_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="btn-quiet px-6 py-3 text-[15px]"
          >
            Book a Demo
          </a>
        </div>
      </Reveal>
    </section>
  );
}

/* ------------------------------ section head ------------------------------ */

function SectionHead({
  eyebrow,
  title,
  lead,
}: {
  eyebrow: string;
  title: string;
  lead?: string;
}) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <Reveal
        as="p"
        className="text-[0.7rem] font-medium uppercase tracking-[0.18em] text-muted-foreground"
      >
        {eyebrow}
      </Reveal>
      <Reveal
        delay={80}
        as="h2"
        className="mt-5 text-[2.1rem] font-semibold leading-[1.05] tracking-[-0.04em] sm:text-[3.2rem]"
      >
        {title}
      </Reveal>
      {lead ? (
        <Reveal
          delay={150}
          as="p"
          className="mt-6 text-base leading-relaxed text-muted-foreground sm:text-lg"
        >
          {lead}
        </Reveal>
      ) : null}
    </div>
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
