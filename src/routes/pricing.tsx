import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Check, ChevronDown, ShieldCheck } from "lucide-react";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PriceDriftRibbon } from "@/components/marketing/PriceDriftRibbon";
import { Reveal } from "@/components/marketing/Reveal";
import { BOOK_DEMO_URL } from "@/lib/marketing-links";
import { marketingStatsQuery } from "@/lib/marketing.functions";
import { PLAN_META } from "@/lib/engine/types";
import { PLAN_FEATURES } from "@/lib/plan-features";
import type { PlanTier } from "@/lib/engine/types";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — pay for the level you're on | CostMyAI" },
      {
        name: "description",
        content:
          "Compare is free forever and finds the cheapest host for models you already run. Certify proves a switch is safe, Rightsize catches oversized workloads, Govern switches autonomously inside the equivalence band.",
      },
      { property: "og:title", content: "Pricing — pay for the level you're on" },
      {
        property: "og:description",
        content:
          "Four levels, one path: Compare free, then Certify, Rightsize and Govern. No provider keys, no placement fees, no cut of your savings.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://www.costmyai.com/pricing" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://www.costmyai.com/pricing" }],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(marketingStatsQuery()),
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
  const { data: stats } = useSuspenseQuery(marketingStatsQuery());
  const [yearly, setYearly] = useState(true);
  const moves = stats.priceChangesTracked;

  return (
    <MarketingShell>
      <Hero yearly={yearly} setYearly={setYearly} moves={moves} />
      <Plans yearly={yearly} moves={moves} />
      <NeverPay moves={moves} />
      <Faq />
      <ClosingCta />
    </MarketingShell>
  );
}

/* ---------------------------------- hero --------------------------------- */

function Hero({
  yearly,
  setYearly,
  moves,
}: {
  yearly: boolean;
  setYearly: (v: boolean) => void;
  moves: number;
}) {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div
        className="pointer-events-none absolute inset-x-0 -top-24 h-[130%] mesh-brand mesh-drift"
        aria-hidden
      />
      <PriceDriftRibbon
        moves={moves}
        orientation="diagonal"
        className="absolute inset-x-0 bottom-0 h-[30%] opacity-[0.10] [mask-image:linear-gradient(180deg,transparent,#000_80%)]"
      />
      <div className="absolute inset-0 texture-dots opacity-50" aria-hidden />

      <div className="relative mx-auto max-w-4xl px-5 pb-20 pt-24 text-center sm:px-8 sm:pb-24 sm:pt-36">
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
          Pay for the level <span className="text-gradient-brand-wide">you're on.</span>
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
          <div className="inline-flex items-center gap-1 rounded-full border border-border bg-background/70 p-1 backdrop-blur">
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

/**
 * The ladder, not a card wall: four rungs on a hairline rail, each one wider
 * than the last in what it includes. Same restraint as the rest of the site.
 */
function Plans({ yearly, moves }: { yearly: boolean; moves: number }) {
  return (
    <section className="relative overflow-hidden px-5 py-20 sm:px-8 sm:py-24">
      <PriceDriftRibbon
        moves={moves}
        orientation="vertical"
        className="absolute inset-y-0 right-0 hidden w-[12%] opacity-[0.14] [mask-image:linear-gradient(270deg,#000,transparent)] lg:block"
      />
      <div className="relative mx-auto max-w-6xl border-t border-border">
        {ORDER.map((plan, i) => {
          const meta = PLAN_META[plan];
          const price = yearly ? meta.yearly : meta.monthly;
          const beta = plan === "rightsize" || plan === "govern";

          return (
            <Reveal
              key={plan}
              delay={i * 80}
              className="grid gap-8 border-b border-border py-12 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-16 sm:py-14"
            >
              <div>
                <div className="flex items-baseline gap-3">
                  <span className="num text-[11px] tracking-[0.18em] text-primary">
                    {`0${i + 1}`}
                  </span>
                  <h2 className="text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">
                    {meta.label}
                  </h2>
                </div>

                <p className="mt-6">
                  <span
                    className={`num text-[3.2rem] font-semibold leading-none tracking-[-0.05em] sm:text-[4rem] ${
                      price === 0 ? "text-gradient-brand-wide" : "text-foreground"
                    }`}
                  >
                    {price === 0 ? "Free" : `$${price}`}
                  </span>
                  {price === 0 ? null : (
                    <span className="text-sm font-medium text-muted-foreground"> /mo</span>
                  )}
                </p>
                <p className="mt-3 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  {beta
                    ? "not on sale yet — price shown for reference"
                    : price === 0
                      ? "no card required"
                      : yearly
                        ? "billed yearly"
                        : "billed monthly, cancel anytime"}
                </p>

                <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground">
                  {meta.blurb}
                </p>

                {beta ? (
                  <p className="mt-7 inline-flex rounded-full border border-dashed border-border px-5 py-2.5 text-sm text-muted-foreground">
                    In closed beta — invitation only
                  </p>
                ) : (
                  <Link
                    to="/auth"
                    className={
                      price === 0
                        ? "btn-gradient mt-7 inline-flex px-5 py-2.5 text-sm"
                        : "btn-quiet mt-7 inline-flex px-5 py-2.5 text-sm"
                    }
                  >
                    {price === 0 ? "Start free" : `Start ${meta.label}`}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                )}
              </div>

              <div className="lg:pt-2">
                <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  {i === 0 ? "What you get" : `Everything below, plus`}
                </p>
                <ul className="mt-6 grid gap-x-10 gap-y-4 sm:grid-cols-2">
                  {PLAN_FEATURES[plan].map((line: string) => (
                    <li key={line} className="flex items-start gap-2.5">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-saving" />
                      <span className="text-[0.95rem] leading-relaxed text-muted-foreground">
                        {line}
                      </span>
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

function NeverPay({ moves }: { moves: number }) {
  return (
    <section className="relative overflow-hidden border-y border-border wash-brand">
      <PriceDriftRibbon
        moves={moves}
        orientation="horizontal"
        className="absolute inset-x-0 top-0 h-[28%] opacity-[0.12] [mask-image:linear-gradient(0deg,transparent,#000)]"
      />
      <div className="relative mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
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
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/10">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <h3 className="mt-6 text-2xl font-semibold tracking-[-0.035em] sm:text-[2rem]">
            Metadata only by default. Never without an explicit opt-in.
          </h3>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Every level runs on the same architecture: the Verification Engine sits in your
            environment and holds your keys there. There is nowhere in our system for a provider key
            to live. Prompt content only ever leaves your environment if you explicitly opt in to
            remote classification —{" "}
            <Link to="/privacy" className="underline underline-offset-2 hover:text-foreground">
              see the opt-in details
            </Link>
            .
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
    <section id="faq" className="scroll-mt-24">
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
    <section className="relative overflow-hidden border-t border-border px-5 py-24 sm:px-8 sm:py-32">
      <div className="pointer-events-none absolute inset-0 mesh-brand mesh-drift opacity-70" aria-hidden />
      <Reveal className="relative mx-auto max-w-3xl text-center">
        <h2 className="text-[2.4rem] font-semibold leading-[1.02] tracking-[-0.045em] sm:text-[3.6rem]">
          Start on <span className="text-gradient-brand-wide">free.</span> Move up when the savings
          do.
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
