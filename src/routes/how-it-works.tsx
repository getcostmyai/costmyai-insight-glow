import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { ArchitectureDiagram } from "@/components/marketing/ArchitectureDiagram";
import { PriceDriftRibbon } from "@/components/marketing/PriceDriftRibbon";
import { Reveal } from "@/components/marketing/Reveal";
import { BOOK_DEMO_URL } from "@/lib/marketing-links";
import { marketingStatsQuery, type MarketingStats } from "@/lib/marketing.functions";
import { PLAN_META, PLAN_ORDER } from "@/lib/engine/types";
import type { PlanTier } from "@/lib/engine/types";
import { PLAN_FEATURES } from "@/lib/plan-features";
import { HOW_STEPS, dashboardShot } from "@/lib/how-it-works";

/**
 * The full "how it works" explanation, promoted out of the homepage's
 * scroll anchor. Copy comes from src/lib/how-it-works.ts and the plan blocks
 * read PLAN_META / PLAN_FEATURES — no fifth copy of either lives here.
 */

export const Route = createFileRoute("/how-it-works")({
  head: () => ({
    meta: [
      { title: "How It Works — CostMyAI" },
      {
        name: "description",
        content:
          "Connect in one environment variable, map your real spend by workload, get a benchmark-backed verdict, switch what holds quality. What each level does, step by step.",
      },
      { property: "og:title", content: "How It Works — CostMyAI" },
      {
        property: "og:description",
        content:
          "Four steps from one environment variable to a governed switch — and exactly what Compare, Certify, Rightsize and Govern each do.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://www.costmyai.com/how-it-works" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://www.costmyai.com/how-it-works" }],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(marketingStatsQuery()),
  component: HowItWorksPage,
});

function HowItWorksPage() {
  const { data: stats } = useSuspenseQuery(marketingStatsQuery());
  return (
    <MarketingShell>
      <Hero stats={stats} />
      <Steps />
      <Architecture stats={stats} />
      <Plans stats={stats} />
      <Close />
    </MarketingShell>
  );
}

/* --------------------------------- hero ---------------------------------- */

function Hero({ stats }: { stats: MarketingStats }) {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div
        className="pointer-events-none absolute inset-x-0 -top-24 h-[130%] mesh-brand mesh-drift"
        aria-hidden
      />
      {/* First sighting of the band: a shallow diagonal, almost gone. */}
      <PriceDriftRibbon
        moves={stats.priceChangesTracked}
        orientation="diagonal"
        className="absolute inset-x-0 bottom-0 h-[55%] opacity-[0.12] [mask-image:linear-gradient(180deg,transparent,#000_70%)]"
      />
      <div className="absolute inset-0 texture-dots opacity-50" aria-hidden />

      <div className="relative mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
        <Reveal className="max-w-3xl">
          <p className="eyebrow">How It Works</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.045em] sm:text-[3.75rem] sm:leading-[1.02]">
            Connect once.{" "}
            <span className="text-gradient-brand-wide">Governed decisions</span> on every workload.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Four steps, no manual exports. From one environment variable to a benchmark-backed
            verdict on every workload, and a switch you can defend afterwards.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link to="/auth" className="btn-gradient px-5 py-2.5 text-sm">
              Start free
            </Link>
            <a
              href={BOOK_DEMO_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-full border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              Book a Demo
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* --------------------------------- steps --------------------------------- */

function Steps() {
  return (
    <section className="wash-section">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-28">
        <div className="mx-auto max-w-4xl">
          {HOW_STEPS.map((s, i) => (
            <Reveal
              key={s.n}
              delay={i * 90}
              className="group relative grid gap-4 border-t border-border py-10 sm:grid-cols-[9rem_1fr] sm:gap-10 sm:py-14"
            >
              <span
                aria-hidden
                className="num pointer-events-none select-none text-[3.5rem] leading-none text-gradient-brand opacity-30 transition-opacity duration-500 group-hover:opacity-100 sm:text-[5rem]"
              >
                {s.n}
              </span>
              <div className="sm:pt-2">
                <h2 className="text-2xl font-semibold tracking-[-0.035em] sm:text-[2rem]">
                  {s.title}
                </h2>
                <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
                  {s.body}
                </p>
                <ul className="mt-6 flex flex-col gap-2.5">
                  {s.detail.map((d) => (
                    <li key={d} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span className="max-w-2xl leading-relaxed">{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
          <div className="border-t border-border" />
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- architecture ------------------------------ */

function Architecture() {
  return (
    <section className="border-t border-border">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-28">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="eyebrow">The request path</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] sm:text-[2.5rem]">
            Runs in your environment. Sees only metadata.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-muted-foreground">
            The Verification Engine sits in your stack as middleware. Requests pass through
            unchanged; only token counts and model names leave your environment. Never prompt
            content.
          </p>
        </Reveal>
        <Reveal delay={80} className="mt-14">
          <ArchitectureDiagram />
        </Reveal>
      </div>
    </section>
  );
}

/* --------------------------------- plans --------------------------------- */

function Plans() {
  return (
    <section className="border-t border-border wash-section">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-28">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="eyebrow">Level by level</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] sm:text-[2.5rem]">
            What each level actually does.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-muted-foreground">
            Same four steps at every level. What changes is how far the verdict is allowed to go.
          </p>
        </Reveal>

        <div className="mt-20 flex flex-col gap-20">
          {PLAN_ORDER.map((plan, i) => (
            <PlanBlock key={plan} plan={plan} index={i} />
          ))}
        </div>

        <Reveal className="mt-16 text-center">
          <Link
            to="/pricing"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            See the full plan comparison <ArrowRight className="h-4 w-4" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

function PlanBlock({ plan, index }: { plan: PlanTier; index: number }) {
  const meta = PLAN_META[plan];
  const flip = index % 2 === 1;
  return (
    <Reveal className="grid items-center gap-10 border-t border-border pt-12 lg:grid-cols-2 lg:gap-16">
      <div className={flip ? "lg:order-2" : undefined}>
        <p className="eyebrow">
          Level <span className="num">{index + 1}</span>
        </p>
        <h3 className="mt-3 text-2xl font-semibold tracking-[-0.035em] sm:text-[2rem]">
          {meta.label}
        </h3>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">{meta.blurb}</p>
        <p className="num mt-4 text-sm text-muted-foreground">
          {meta.monthly === 0 ? "Free forever" : `From $${meta.yearly}/mo billed yearly`}
        </p>
        <ul className="mt-6 flex flex-col gap-2.5">
          {PLAN_FEATURES[plan].map((f) => (
            <li key={f} className="flex items-start gap-2.5 text-sm text-muted-foreground">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span className="leading-relaxed">{f}</span>
            </li>
          ))}
        </ul>
      </div>
      <DashboardShot plan={plan} label={meta.label} />
    </Reveal>
  );
}

/**
 * Aspect-ratio-reserved frame for the real dashboard capture. Until the file
 * exists the frame keeps its space and caption; the <img> hides itself on
 * error so no broken-image icon is ever shown.
 */
function DashboardShot({ plan, label }: { plan: PlanTier; label: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <figure className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="relative aspect-[16/10] w-full bg-muted/40">
        {failed ? null : (
          <img
            src={dashboardShot(plan)}
            alt={`The ${label} dashboard in CostMyAI, showing the switches and measurements available at that level`}
            loading="lazy"
            onError={() => setFailed(true)}
            className="absolute inset-0 h-full w-full object-cover object-top"
          />
        )}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: "var(--gradient-brand)",
            opacity: failed ? 0.06 : 0,
          }}
        />
      </div>
      <figcaption className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
        {label} — the workspace view at this level.
      </figcaption>
    </figure>
  );
}

/* --------------------------------- close --------------------------------- */

function Close() {
  return (
    <section className="border-t border-border">
      <div className="mx-auto max-w-3xl px-5 py-24 text-center sm:px-8 sm:py-28">
        <Reveal>
          <h2 className="text-3xl font-semibold tracking-[-0.035em] sm:text-[2.5rem]">
            One environment variable. Then the evidence.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-muted-foreground">
            Compare is free forever, and it needs no provider keys to start.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link to="/auth" className="btn-gradient px-5 py-2.5 text-sm">
              Start free
            </Link>
            <Link
              to="/standard"
              className="rounded-full border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              Read the CostMyAI Standard
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
