import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  Layers,
  PlayCircle,
  Rocket,
  ShieldCheck,
  User,
  Users,
} from "lucide-react";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { ArchitectureDiagram } from "@/components/marketing/ArchitectureDiagram";
import { Estimator } from "@/components/marketing/Estimator";
import { ForecastDiagram } from "@/components/marketing/ForecastDiagram";
import { ProviderMarquee } from "@/components/marketing/ProviderMarquee";
import { CountUp, Reveal } from "@/components/marketing/Reveal";
import { BOOK_DEMO_URL } from "@/lib/marketing-links";
import { FAQ_ITEMS, HOMEPAGE_FAQ_IDS, findFaqItem } from "@/lib/faq/questions";
import { marketingStatsQuery, type MarketingStats } from "@/lib/marketing.functions";
import { PLAN_META } from "@/lib/engine/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CostMyAI — stop overpaying for AI" },
      {
        name: "description",
        content:
          "CostMyAI reads only metadata from your stack and proves where the same quality costs less. Same-provider swaps it executes for you, automatically on Govern; a move to another provider waits until you allow routing to it. No provider keys, no prompt content.",
      },
      { property: "og:title", content: "CostMyAI — stop overpaying for AI" },
      {
        property: "og:description",
        content:
          "Certified, benchmark-backed model and host switches. Metadata only, independent benchmarks, and an honest refusal whenever a saving cannot be proven.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(marketingStatsQuery()),
  component: HomePage,
});

function HomePage() {
  const { data: stats } = useSuspenseQuery(marketingStatsQuery());

  return (
    <MarketingShell>
      <Hero stats={stats} />
      <ProviderMarquee stats={stats} />

      <Estimator />
      <StillMoving />
      <Forecast />

      <HowItWorks />
      <Architecture />
      <BuiltFor />
      <VideoSection />
      <Pricing stats={stats} />
      <Neutrality />
      <Faq stats={stats} />
      <ClosingCta />

    </MarketingShell>
  );
}

/* ------------------------------- 01 · hero ------------------------------- */

function Hero({ stats }: { stats: MarketingStats }) {
  return (
    <section className="relative overflow-hidden wash-hero">
      <div className="absolute inset-0 texture-dots opacity-60" aria-hidden />
      <div className="relative mx-auto max-w-4xl px-5 pb-28 pt-28 text-center sm:px-8 sm:pb-36 sm:pt-40">
        <Reveal as="h1" className="text-[3.1rem] font-semibold leading-[0.98] tracking-[-0.045em] sm:text-[5rem]">
          Stop overpaying <span className="text-gradient-brand">for AI.</span>
        </Reveal>

        <Reveal
          delay={120}
          as="p"
          className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl"
        >
          CostMyAI reads your gateway metadata, forecasts your month-end AI bill from real usage,
          proves cheaper options against real benchmarks, and switches only what holds quality.
          Same-provider swaps run automatically with Govern; moving to a different provider waits
          on your own routing grant.

        </Reveal>

        <Reveal delay={180} className="mx-auto mt-9 grid max-w-4xl gap-3 text-left sm:grid-cols-2 lg:grid-cols-4">
          {[
            { k: "Month-end forecast", v: "Your bill, before the invoice" },
            { k: "Cheaper host", v: "Same model, lower price" },
            { k: "Cheaper model", v: "Benchmarks the same" },
            { k: "Smaller model", v: "Same result, less compute" },
          ].map((m) => (

            <div key={m.k} className="border-t border-border pt-3">
              <p className="text-sm font-semibold tracking-[-0.01em]">{m.k}</p>
              <p className="mt-1 text-sm text-muted-foreground">{m.v}</p>
            </div>
          ))}
        </Reveal>


        <Reveal delay={220} className="mt-11 flex flex-wrap items-center justify-center gap-3">
          <a href="#estimator" className="btn-gradient px-6 py-3 text-[15px]">
            See if you are overpaying
            <ArrowRight className="h-4 w-4" />
          </a>
          <a
            href={BOOK_DEMO_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="btn-quiet px-6 py-3 text-[15px]"
          >
            Book a Demo
          </a>
        </Reveal>

        <Reveal delay={300} as="p" className="mt-6 text-sm text-muted-foreground">
          Metadata only. Never your prompt content.
        </Reveal>

        {stats.live ? (
          <div className="mt-20 grid grid-cols-3 gap-6 border-t border-border/60 pt-12 sm:gap-10">
            {[
              { value: stats.modelCount, label: "Models tracked" },
              { value: stats.providerCount, label: "Providers priced" },
              { value: stats.priceChangesTracked, label: "Price moves this month" },
            ].map((s, i) => (
              <Reveal key={s.label} delay={380 + i * 90}>
                <CountUp
                  value={s.value}
                  format={(n) => Math.round(n).toLocaleString("en-US")}
                  className="block text-4xl font-semibold tracking-[-0.045em] text-foreground sm:text-6xl"
                />
                <p className="mt-3 text-[0.65rem] font-medium uppercase tracking-[0.14em] text-muted-foreground sm:text-[0.7rem]">
                  {s.label}
                </p>
              </Reveal>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/* ----------------------------- 02 · forecast ----------------------------- */

const FORECAST_PRINCIPLES = [
  {
    n: "01",
    title: "What you already spent is never guessed",
    body: "Month-to-date is a fixed, known baseline read from real usage. Only the days still ahead of you get projected, so the part of the month that already happened can never move.",
  },
  {
    n: "02",
    title: "Your week has a shape",
    body: "Weekday and weekend traffic are not the same workload. We detect the weekly rhythm in your own usage and apply it only when the pattern is genuinely there, never as a blanket assumption.",
  },
  {
    n: "03",
    title: "A spike is not a trend",
    body: "Growth is carried forward, but damped and capped, so one loud Tuesday cannot compound into a frightening month-end number that was never going to happen.",
  },
  {
    n: "04",
    title: "A range when a number would be dishonest",
    body: "When your usage is too dispersed to support a single figure, you get a range instead of false precision. A forecast that admits its own uncertainty is the one you can take to a board.",
  },
  {
    n: "05",
    title: "Retired and brand-new workloads are handled",
    body: "A workload that went silent stops inflating the rest of the month. One that appeared days ago is flagged rather than extrapolated as if it had always been there.",
  },
];

function Forecast() {
  return (
    <section id="forecast" className="scroll-mt-24 border-y border-border bg-card">
      <div className="mx-auto max-w-6xl px-5 py-28 sm:px-8 sm:py-36">
        <SectionHead
          eyebrow="Spend Forecast"
          title="Your month-end AI bill, before the invoice arrives."
          lead="Most teams find out what AI cost them after the money is gone. We project the close of the month from your real usage, and we tell you what the projection is based on."
        />

        <div className="mx-auto mt-16 grid max-w-4xl gap-6 sm:grid-cols-3">
          {[
            { k: "Month to date", v: "Actual", s: "Known, never re-estimated" },
            { k: "Rest of month", v: "Projected", s: "From your trailing usage level" },
            { k: "Month-end", v: "Point or range", s: "Range when the data demands it" },
          ].map((c, i) => (
            <Reveal key={c.k} delay={i * 90} className="border-t border-border pt-4">
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {c.k}
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">{c.v}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{c.s}</p>
            </Reveal>
          ))}
        </div>

        <div className="mt-24">
          <ForecastDiagram />
        </div>

        <div className="mx-auto mt-24 max-w-4xl">
          {FORECAST_PRINCIPLES.map((p, i) => (
            <Reveal
              key={p.n}
              delay={i * 80}
              className="group grid gap-4 border-t border-border py-9 sm:grid-cols-[7rem_1fr] sm:gap-10"
            >
              <span
                aria-hidden
                className="num pointer-events-none select-none text-[2.75rem] leading-none text-gradient-brand opacity-30 transition-opacity duration-500 group-hover:opacity-100 sm:text-[3.5rem]"
              >
                {p.n}
              </span>
              <div className="sm:pt-1">
                <h3 className="text-xl font-semibold tracking-[-0.03em] sm:text-2xl">{p.title}</h3>
                <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
                  {p.body}
                </p>
              </div>
            </Reveal>
          ))}
          <div className="border-t border-border" />
        </div>

        <Reveal delay={120} className="mx-auto mt-12 max-w-4xl">
          <p className="text-sm leading-relaxed text-muted-foreground">
            The exact weighting behind these rules is ours. What is public is the principle: every
            forecast states its own basis, so you always know whether you are looking at a
            measurement or an estimate.{" "}
            <Link to="/blog/$slug" params={{ slug: "ai-spend-forecasting" }} className="font-semibold text-primary">
              Read how we forecast
            </Link>
            .
          </p>
        </Reveal>
      </div>
    </section>
  );
}


/* ---------------------- 03b · nothing holds still ------------------------ */

/**
 * A single claim, at headline scale, with one link out to the full argument.
 * Deliberately not a summary of the article: the whole job of this band is to
 * make the reader realise the question exists.
 */
function StillMoving() {
  return (
    <section className="wash-section">
      <div className="mx-auto max-w-6xl border-y border-border px-5 py-24 sm:px-8 sm:py-32">
        <Reveal className="max-w-4xl">
          <p className="eyebrow">Why this is a system, not an audit</p>
          <h2 className="mt-5 text-4xl font-semibold leading-[1.04] tracking-[-0.04em] sm:text-6xl">
            Nothing about AI pricing holds still.
            <br />
            Why would a{" "}
            <span className="text-gradient-brand">one-time audit</span>?
          </h2>
          <p className="mt-7 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Prices are cut in response to competitors, your own workloads get heavier as they
            mature, and the same model ID can bill differently next quarter with your code
            untouched. An audit tells you where you stood. We measure where you are.
          </p>
          <Link
            to="/blog/$slug"
            params={{ slug: "why-ai-cost-optimisation-expires" }}
            className="mt-9 inline-flex items-center gap-2 text-base font-semibold text-primary hover:underline"
          >
            Read the full argument, and what we can and cannot prove
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}


/* ------------------------------- 04 · video ------------------------------ */

function VideoSection() {
  return (
    <section className="border-y border-border bg-card">
      <div className="mx-auto max-w-6xl px-5 py-28 sm:px-8 sm:py-36">
        <SectionHead
          eyebrow="See It Working"
          title="From live usage to a governed decision in under 60 seconds."
          lead="Real usage in, a defensible verdict out."
        />
        <Reveal delay={80} className="mx-auto mt-14 max-w-4xl">
          <div className="relative grid aspect-video place-items-center overflow-hidden rounded-[1.75rem] border border-border bg-background">
            <div className="absolute inset-0 opacity-[0.07] fill-gradient-brand" aria-hidden />
            <div className="relative text-center">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-secondary">
                <PlayCircle className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="mt-4 text-sm font-medium text-muted-foreground">
                Product demo coming soon
              </p>
              <a
                href={BOOK_DEMO_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="btn-quiet mt-6 px-5 py-2.5 text-sm"
              >
                Get a walkthrough live instead
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* --------------------------- 05 · architecture --------------------------- */

function Architecture() {
  return (
    <section id="architecture" className="scroll-mt-24 border-y border-border bg-card">
      <div className="mx-auto max-w-6xl px-5 py-28 sm:px-8 sm:py-36">
        <SectionHead
          eyebrow="Architecture"
          title="Runs in your environment. Sees only metadata."
          lead="The Verification Engine sits in your stack as middleware. Requests pass through unchanged; only token counts and model names leave your environment. Never prompt content."
        />
        <Reveal delay={80} className="mt-14">
          <ArchitectureDiagram />
        </Reveal>
      </div>
    </section>
  );
}

/* --------------------------- 06 · how it works --------------------------- */

const STEPS = [
  {
    n: "01",
    title: "Connect",
    body: "Point your application at the Verification Engine endpoint. One environment variable change. Requests forward to your provider unchanged. The engine reads token counts, model names, and request counts. Never your prompt content.",
  },
  {
    n: "02",
    title: "Map",
    body: "We read your real spend, group it by workload, and benchmark every model against the live catalog — which re-syncs continuously, so a verdict is always measured against today's prices, not last quarter's. The buy-side view, not the vendor's.",
  },
  {
    n: "03",
    title: "Verdict",
    body: "See which switches hold quality on real benchmarks, and which ones we refuse to certify. A governed decision names what it cannot prove.",
  },
  {
    n: "04",
    title: "Switch",
    body: "Switch the workloads that hold quality. Keep the savings. Leave the rest exactly where they are. Not paying more than you need to, on the record and defensible.",
  },
];

function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-24 wash-section">
      <div className="mx-auto max-w-6xl px-5 py-28 sm:px-8 sm:py-36">
        <SectionHead
          eyebrow="How It Works"
          title="Connect once. Governed decisions on every workload."
          lead="Four steps, no manual exports — from one environment variable to a benchmark-backed verdict on every workload."
        />

        <div className="mx-auto mt-20 max-w-4xl">
          {STEPS.map((s, i) => (
            <Reveal
              key={s.n}
              delay={i * 90}
              className="group relative grid gap-4 border-t border-border py-10 sm:grid-cols-[9rem_1fr] sm:gap-10 sm:py-12"
            >
              <span
                aria-hidden
                className="num pointer-events-none select-none text-[3.5rem] leading-none text-gradient-brand opacity-30 transition-opacity duration-500 group-hover:opacity-100 sm:text-[5rem]"
              >
                {s.n}
              </span>
              <div className="sm:pt-2">
                <h3 className="text-2xl font-semibold tracking-[-0.035em] sm:text-[2rem]">
                  {s.title}
                </h3>
                <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
                  {s.body}
                </p>
              </div>
            </Reveal>
          ))}
          <div className="border-t border-border" />
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- 07 · built for ---------------------------- */

const PERSONAS = [
  {
    icon: User,
    title: "Solo founder",
    pain: "\u201cOne invoice, a dozen features, and no idea which one is burning the budget.\u201d",
    resolution:
      "See exactly which feature or model call is driving the cost \u2014 and the cheaper way to run it.",
  },
  {
    icon: Users,
    title: "Small team",
    pain: "\u201cWhoever shipped the feature picked the model, and nobody's checked since.\u201d",
    resolution:
      "Continuous tracking with nobody assigned to it \u2014 what changed, and what to fix, every time.",
  },
  {
    icon: Layers,
    title: "Agency",
    pain: "\u201cClient work runs through your own infrastructure, and every model call eats into a thin margin.\u201d",
    resolution:
      "Cut the underlying compute cost \u2014 yours and every client's \u2014 straight back into your margin.",
  },
  {
    icon: Rocket,
    title: "Scale-up",
    pain: "\u201cNew features, more demand, more teams shipping \u2014 spend grows from every direction at once.\u201d",
    resolution:
      "One place tracking every workload as it grows, with exactly what to cut and by how much.",
  },
  {
    icon: Building2,
    title: "Enterprise",
    pain: "\u201cSpend is standardized, but nobody can put a confident number on next quarter.\u201d",
    resolution:
      "A forecast you can defend, and controls that never force a team off their model.",
  },
];

function BuiltFor() {
  return (
    <section className="wash-section">
      <div className="mx-auto max-w-6xl px-5 py-28 sm:px-8 sm:py-36">
        <SectionHead
          eyebrow="Built For"
          title="Built for whoever is accountable for the AI spend."
          lead="From a first scary invoice to governance across every team."
        />

        <div className="mx-auto mt-20 max-w-4xl">
          {PERSONAS.map((p, i) => (
            <Reveal key={p.title} delay={i * 80}>
              <a
                href={BOOK_DEMO_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="group grid grid-cols-[auto_1fr_auto] items-center gap-5 border-t border-border py-7 transition-colors hover:border-primary/40"
              >
                <p.icon className="h-6 w-6 text-primary transition-transform duration-500 group-hover:scale-110" />
                <div className="min-w-0">
                  <p className="text-xl font-semibold tracking-[-0.03em] transition-colors group-hover:text-gradient-brand sm:text-2xl">
                    {p.title}
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground sm:text-base">
                    {p.pain}
                  </p>
                  <p className="mt-1.5 text-sm font-medium leading-relaxed text-primary sm:text-base">
                    {p.resolution}
                  </p>
                </div>
                <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-all duration-300 group-hover:translate-x-1 group-hover:text-primary" />
              </a>
            </Reveal>
          ))}
          <div className="border-t border-border" />
        </div>
      </div>
    </section>
  );
}


/* ------------------------------ 08 · pricing ----------------------------- */

const PLAN_FEATURES: Record<string, string[]> = {
  compare: [
    "Same model, cheaper host — on your own traffic",
    "Live price catalog across every tracked provider",
    "Metadata-only ingest, no provider keys",
    "Unlimited workloads, free forever",
  ],
  certify: [
    "Everything in Compare",
    "Quality-matched cheaper models, benchmark-backed",
    "Measured equivalence margin on every claim",
    "Named refusals when nothing can be proven",
  ],
  rightsize: [
    "Everything in Certify",
    "Oversized-workload detection per task class",
    "Manual switching with one-click rollback",
    "Objectives: cost, latency ceiling, quality floor",
  ],
  govern: [
    "Everything in Rightsize",
    "Autonomous switching inside the equivalence band",
    "Full audit trail on every automated decision",
    "Billing reconciliation against your own invoices",
  ],
};

const LEVELS = ["compare", "certify", "rightsize", "govern"] as const;

function Pricing({ stats }: { stats: MarketingStats }) {
  const [yearly, setYearly] = useState(true);

  return (
    <section id="pricing" className="scroll-mt-24 wash-section">
      <div className="mx-auto max-w-6xl px-5 py-28 sm:px-8 sm:py-36">
        <SectionHead
          eyebrow="Pricing"
          title="Start free. Scale when you need to."
          lead={`Pricing covers ${stats.modelCount} models across ${stats.providerCount} providers.`}
        />

        <div className="mt-8 flex justify-center">
          <div className="inline-flex rounded-full border border-border bg-background p-1">
            {[
              { id: true, label: "Annual" },
              { id: false, label: "Monthly" },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                onClick={() => setYearly(o.id)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  yearly === o.id ? "fill-gradient-brand text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {LEVELS.map((plan, i) => {
            const meta = PLAN_META[plan];
            const price = yearly ? meta.yearly : meta.monthly;
            const featured = plan === "rightsize";
            return (
              <Reveal
                key={plan}
                delay={i * 80}
                className={`flex flex-col rounded-3xl border p-6 ${
                  featured
                    ? "border-primary/40 bg-primary-soft shadow-[var(--shadow-card)]"
                    : "border-border bg-background shadow-[var(--shadow-card)]"
                }`}
              >
                <p className="text-sm font-semibold tracking-tight">{meta.label}</p>
                <p className="num mt-4 text-3xl">
                  {price === 0 ? "Free" : `$${price}`}
                  {price === 0 ? null : (
                    <span className="text-sm font-medium text-muted-foreground"> /mo</span>
                  )}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {price === 0 ? "No card, ever" : yearly ? "billed annually" : "billed monthly"}
                </p>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{meta.blurb}</p>

                <ul className="mt-5 flex-1 space-y-2.5">
                  {PLAN_FEATURES[plan].map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-saving" />
                      <span className="text-sm leading-snug text-muted-foreground">{f}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  to="/auth"
                  className={`mt-6 ${featured ? "btn-gradient" : "btn-quiet"} w-full px-5 py-2.5 text-sm`}
                >
                  {plan === "compare" ? "Start free" : `Get ${meta.label}`}
                </Link>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------- 09 · neutrality ---------------------------- */

const CHARTER = [
  {
    title: "No vendor affiliation",
    body: "No provider pays for placement, ranking, or inclusion. There is no ad slot to buy here.",
  },
  {
    title: "Buy-side only",
    body: "We are paid by you and only by you. A cost advisor with a revenue share from the destination is a sales channel in a lab coat.",
  },
  {
    title: "Independent benchmarks",
    body: "Quality claims rest on third-party evaluations we do not run, with the measurement margin published alongside the score.",
  },
  {
    title: "Refusal is a feature",
    body: "When nothing clears the bar you get the refusal and its reason — not a weaker suggestion dressed up as a saving.",
  },
];

function Neutrality() {
  return (
    <section id="neutrality" className="scroll-mt-24 px-5 py-14 sm:px-8">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] fill-gradient-brand px-8 py-20 text-primary-foreground sm:px-14">
        <div className="absolute inset-0 texture-dots opacity-20" aria-hidden />
        <div className="relative">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-80">
              Neutrality Charter
            </p>
            <h2 className="mt-4 text-3xl font-bold leading-tight tracking-[-0.028em] sm:text-[2.6rem]">
              We don't work for OpenAI, Anthropic, or anyone else who sells you tokens. We work for
              your P&amp;L.
            </h2>
            <p className="mt-5 text-[15px] leading-relaxed opacity-90">
              Nobody is buying products or features — they all buy a better P&amp;L.
            </p>
            <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed opacity-80">
              Financial Governance requires independence. We have no provider affiliations, no
              sponsored placements, and no incentive to recommend any specific model.
            </p>
          </div>

          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CHARTER.map((c, i) => (
              <Reveal
                key={c.title}
                delay={i * 80}
                className="rounded-2xl border border-primary-foreground/20 bg-primary-foreground/10 p-5 backdrop-blur-sm"
              >
                <ShieldCheck className="h-5 w-5 opacity-90" />
                <p className="mt-3 font-semibold tracking-tight">{c.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed opacity-85">{c.body}</p>
              </Reveal>
            ))}
          </div>

          <div className="mt-10 rounded-2xl border border-primary-foreground/20 bg-primary-foreground/10 p-6 backdrop-blur-sm sm:p-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-foreground/20">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold tracking-tight">
                  Why we refuse to match a headline number from other AI-spend tools.
                </h3>
                <p className="mt-2 text-[15px] leading-relaxed opacity-85">
                  Some routers advertise cost reduction by citing their own internal reports —
                  not independent, third-party verification. CostMyAI will not certify a switch we
                  cannot prove against a published, independent benchmark. A global routing dial
                  that silently reroutes traffic might move most of your workloads; we would refuse
                  to certify most of those moves because they lack per-workload proof. When the
                  benchmark cannot separate the models, you get a refusal and the reason — not a
                  weaker suggestion dressed up as a saving.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-10 text-center">
            <Link
              to="/legal/methodology"
              className="inline-flex items-center gap-1.5 text-sm font-semibold underline-offset-4 hover:underline"
            >
              Read the full Methodology →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------- 10 · faq ------------------------------- */

function Faq(_props: { stats: MarketingStats }) {
  const items = HOMEPAGE_FAQ_IDS.map((id) => findFaqItem(id)).filter(
    (i): i is NonNullable<typeof i> => Boolean(i),
  );

  const [open, setOpen] = useState(-1);

  return (
    <section id="faq" className="scroll-mt-24 border-t border-border bg-card">
      <div className="mx-auto max-w-6xl px-5 py-28 sm:px-8 sm:py-36">
        <SectionHead eyebrow="FAQ" title="Common questions, accurate answers." />
        <div className="mx-auto mt-20 max-w-3xl">
          {items.map((item, i) => {
            const isOpen = open === i;
            return (
              <Reveal key={item.id} delay={i * 70} className="border-t border-border">
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
                  <div className="overflow-hidden pb-7 pl-[3.1rem] pr-10">
                    <p className="text-base leading-relaxed text-muted-foreground">{item.a}</p>
                    <Link
                      to="/faq"
                      hash={item.id}
                      className="mt-4 inline-flex text-sm font-semibold text-primary underline-offset-4 hover:underline"
                    >
                      Read more →
                    </Link>
                  </div>
                </div>
              </Reveal>
            );
          })}
          <div className="border-t border-border" />

          <div className="mt-10 text-center">
            <Link
              to="/faq"
              className="inline-flex items-center gap-1.5 text-sm font-semibold underline-offset-4 hover:underline"
            >
              See all {FAQ_ITEMS.length} questions →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}


/* ----------------------------- 11 · closing ------------------------------ */

function ClosingCta() {
  return (
    <section className="px-5 py-20 sm:px-8">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] fill-gradient-brand px-8 py-16 text-center text-primary-foreground sm:px-16">
        <div className="absolute inset-0 texture-dots opacity-20" aria-hidden />
        <div className="relative">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Stop absorbing your AI spend. Start governing it.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed opacity-90">
            Connect once and get a complete, defensible breakdown of every workload in under 60
            seconds — what holds quality cheaper, what does not, and exactly what we refuse to
            certify.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/auth"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-background px-6 py-3 text-[15px] font-semibold text-foreground transition-transform hover:-translate-y-px"
            >
              Start free
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href={BOOK_DEMO_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-primary-foreground/40 px-6 py-3 text-[15px] font-semibold transition-colors hover:bg-primary-foreground/10"
            >
              Book a Demo
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function SectionHead({
  eyebrow,
  title,
  lead,
  align = "center",
}: {
  eyebrow: string;
  title: string;
  lead?: string;
  align?: "center" | "left";
}) {
  return (
    <Reveal className={align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-xl"}>
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] sm:text-[2.75rem] sm:leading-[1.05]">
        {title}
      </h2>
      {lead ? (
        <p className="mt-5 text-base leading-relaxed text-muted-foreground">{lead}</p>
      ) : null}
    </Reveal>
  );
}
