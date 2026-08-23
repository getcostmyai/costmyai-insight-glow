import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Reveal } from "@/components/marketing/Reveal";
import { PriceDriftRibbon } from "@/components/marketing/PriceDriftRibbon";
import {
  BandExplainer,
  ProofMatrix,
  RungSelfAssessment,
  RungStack,
} from "@/components/marketing/StandardVisuals";
import { intelligenceQuery } from "@/lib/intelligence.functions";
import { marketingStatsQuery } from "@/lib/marketing.functions";
import type { BandWinner } from "@/lib/intelligence/intelligence.server";


/**
 * The CostMyAI Standard — the pillar page. Blog articles are supporting
 * content that link up here; this page links back down to them.
 *
 * Treated as a versioned, citable artifact (like Methodology), not a dated
 * post: revisions bump VERSION and add a changelog line rather than editing
 * silently.
 */

const VERSION = "v1.0";
const UPDATED = "3 August 2026";

/** Shown only when the live catalog has no discriminating band yet. */
const ILLUSTRATIVE_BAND: BandWinner = {
  taskClass: "reasoning",
  suite: "illustrative",
  margin: 1.8,
  bar: 79.4,
  topScore: 81.2,
  modelKey: "illustrative",
  displayName: "cheapest qualifying model",
  score: 79.9,
  pricePerMtok: 0,
  hostLabel: "—",
  qualifying: 0,
};

const SUPPORTING = [
  {
    slug: "finops-for-ai",
    title: "FinOps for AI: how it's different from cloud FinOps",
    note: "Why AI spend needs its own discipline. This is the problem rung one exists to fix.",
  },
  {
    slug: "ai-cost-governance-101",
    title: "AI cost governance 101: building visibility before finance asks",
    note: "Seeing what you spent is not the same as knowing what you will spend. The groundwork under rung one.",
  },
  {
    slug: "benchmark-backed-model-switching",
    title: "Benchmark-backed model switching: why cheaper isn't automatically safe",
    note: "How we decide two models are equally good, explained in full. That is rung two.",
  },
  {
    slug: "ai-cost-governance-framework",
    title: "The AI Cost Governance Framework: a guide for engineering teams",
    note: "The long read: all four rungs, step by step, for engineering teams.",
  },
];


export const Route = createFileRoute("/standard")({
  head: () => ({
    meta: [
      { title: "The CostMyAI Standard — AI spend governance framework" },
      {
        name: "description",
        content:
          "The CostMyAI Standard: a four step framework for cutting your AI bill without guessing. Compare, Certify, Rightsize, Govern, and the proof each step needs.",
      },
      {
        name: "keywords",
        content: "AI spend governance framework, AI cost management, cost governance framework",
      },
      { property: "og:title", content: "The CostMyAI Standard" },
      {
        property: "og:description",
        content:
          "A four step framework for getting your AI bill under control. Every saving has to be proven, and when the proof is missing we say no instead of guessing.",
      },

      { property: "og:type", content: "article" },
      { property: "og:url", content: "https://www.costmyai.com/standard" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://www.costmyai.com/standard" }],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(intelligenceQuery()),
      context.queryClient.ensureQueryData(marketingStatsQuery()),
    ]),
  component: StandardPage,
});

function StandardPage() {
  const { data: live } = useSuspenseQuery(intelligenceQuery());
  const { data: stats } = useSuspenseQuery(marketingStatsQuery());
  const winner = live.data.bandWinners[0] ?? ILLUSTRATIVE_BAND;
  const isLiveBand = Boolean(live.data.bandWinners[0]);

  return (
    <MarketingShell>
      <div className="flex flex-col">
        {/* Title + version stamp -------------------------------------------- */}
        <section className="relative overflow-hidden border-b border-border px-5 pb-14 pt-24 sm:px-8 sm:pb-16 sm:pt-32">
          <div
            className="pointer-events-none absolute inset-x-0 -top-24 h-[130%] mesh-brand mesh-drift"
            aria-hidden
          />
          <PriceDriftRibbon
            moves={stats.priceChangesTracked}
            orientation="diagonal"
            className="absolute inset-x-0 bottom-0 h-[55%] opacity-[0.12] [mask-image:linear-gradient(180deg,transparent,#000_70%)]"
          />
          <div className="absolute inset-0 texture-dots opacity-50" aria-hidden />
          <div className="relative mx-auto max-w-6xl">
            <Reveal className="max-w-4xl">
              <p className="eyebrow">The Standard</p>
              <h1 className="mt-5 text-5xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-7xl">
                The CostMyAI <span className="text-gradient-brand-wide">Standard</span>
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
                A four step framework for getting your AI bill under control, where every saving has
                to be proven, never estimated.
              </p>

              <p className="mt-8 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                <span className="num">{VERSION}</span> · Last updated {UPDATED}
              </p>
            </Reveal>
          </div>
        </section>


        {/* Hero visual: the four-level stack -------------------------------- */}
        <section className="relative overflow-hidden wash-brand px-5 py-24 sm:px-8 sm:py-32">
          <PriceDriftRibbon
            moves={stats.priceChangesTracked}
            orientation="vertical"
            className="absolute inset-y-0 right-0 hidden w-[14%] opacity-[0.18] [mask-image:linear-gradient(270deg,#000,transparent)] lg:block"
          />
          <div className="relative mx-auto max-w-6xl">

            <RungStack />
            <Reveal delay={120}>
              <p className="mt-10 max-w-3xl text-[1.0625rem] leading-[1.75] text-muted-foreground">
                Four levels, in order. What defines each one is the evidence you need to be on it,
                not the saving it promises. You cannot climb higher than your evidence reaches, and
                a step you cannot back up with data is not a plan. It is a guess with a price tag
                on it.
              </p>

            </Reveal>
          </div>
        </section>

        {/* Rung 2 mechanic, shown ------------------------------------------- */}
        <section className="border-t border-border/60 px-5 py-24 sm:px-8 sm:py-32">
          <div className="mx-auto max-w-6xl">
            <Reveal className="max-w-3xl">
              <p className="eyebrow">Rung 2 · how it works</p>
              <h2 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
                The cheapest model that is still good enough.
                <br />
                <span className="text-muted-foreground/60">Not the highest scoring one.</span>
              </h2>
              <p className="mt-7 text-[1.0625rem] leading-[1.75] text-muted-foreground">
                Every benchmark has a margin of error. Take the best model&apos;s score, subtract
                that error margin, and you get the pass mark. Any model at or above it scores so
                close to the best that the test cannot honestly separate them, so the only thing
                left to compare is price, and the cheapest one that passes wins. If every model
                lands inside the error margin, the test proves nothing and we refuse to use it as an
                argument.
              </p>
            </Reveal>

            <Reveal delay={80} className="mt-12">
              <div className="flex flex-wrap items-baseline justify-between gap-4">
                <p className="text-sm font-medium">
                  {isLiveBand ? (
                    <>
                      Live example · {winner.taskClass} tasks{" "}
                      <span className="text-muted-foreground">({winner.suite} benchmark)</span>
                    </>
                  ) : (
                    "Example, for illustration"
                  )}
                </p>
                <p className="text-[0.7rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  {isLiveBand
                    ? "live prices and scores"
                    : "no test currently separates the models"}
                </p>
              </div>

              <BandExplainer winner={winner} live={isLiveBand} />
            </Reveal>
          </div>
        </section>

        {/* What each rung has to prove -------------------------------------- */}
        <section className="relative overflow-hidden wash-brand border-t border-border/60 px-5 py-24 sm:px-8 sm:py-32">
          <div className="relative mx-auto max-w-6xl">
            <Reveal className="max-w-3xl">
              <p className="eyebrow">Evidence</p>
              <h2 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
                What each rung has to <span className="text-gradient-brand-wide">prove</span>.
              </h2>

            </Reveal>
            <Reveal delay={60} className="mt-12">
              <ProofMatrix />
            </Reveal>
          </div>
        </section>

        {/* The corollary ----------------------------------------------------- */}
        <section className="border-t border-border/60 px-5 py-24 sm:px-8 sm:py-32">
          <div className="mx-auto max-w-6xl">
            <Reveal className="max-w-4xl">
              <p className="eyebrow">The flip side</p>
              <h2 className="mt-5 text-4xl font-semibold leading-[1.06] tracking-[-0.04em] sm:text-6xl">
                When the proof is missing, the right answer is{" "}
                <span className="text-gradient-brand">no recommendation</span>, never a guess.
              </h2>
              <p className="mt-8 max-w-2xl text-[1.0625rem] leading-[1.75] text-muted-foreground">
                No price for what you run today, no score for what you run today, a benchmark that
                cannot separate the models, nothing cheaper that passes, a speed requirement the
                alternative would miss, or a saving too small to be worth the switch. In each of
                those cases we say no and tell you why. That is a feature, not a bug: it is exactly
                why the recommendations you do get hold up when someone checks them.
              </p>

              <Link
                to="/legal/methodology"
                className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-primary transition-opacity hover:opacity-80"
              >
                Read the full methodology →
              </Link>
            </Reveal>
          </div>
        </section>

        {/* Interactive self-assessment --------------------------------------- */}
        <section className="border-t border-border/60 px-5 py-24 sm:px-8 sm:py-32">
          <div className="mx-auto max-w-6xl">
            <Reveal className="max-w-3xl">
              <p className="eyebrow">How to apply this</p>
              <h2 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
                Two questions show you where you stand.
              </h2>
              <p className="mt-7 text-[1.0625rem] leading-[1.75] text-muted-foreground">
                Answer them honestly. You get the highest step your evidence can back up right now,
                not the one you would like to be on.
              </p>

            </Reveal>
            <Reveal delay={60} className="mt-12">
              <RungSelfAssessment />
            </Reveal>
          </div>
        </section>

        {/* Supporting articles ------------------------------------------------ */}
        <section className="border-t border-border/60 px-5 py-24 sm:px-8 sm:py-32">
          <div className="mx-auto max-w-6xl">
            <Reveal className="max-w-3xl">
              <p className="eyebrow">Supporting reading</p>
              <h2 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
                Each rung, in depth.
              </h2>
            </Reveal>
            <ul className="mt-12 divide-y divide-border/60 border-t border-border/60">
              {SUPPORTING.map((a, i) => (
                <li key={a.slug}>
                  <Reveal delay={i * 50}>
                    <Link
                      to="/blog/$slug"
                      params={{ slug: a.slug }}
                      className="group grid gap-3 py-8 sm:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] sm:gap-12"
                    >
                      <span className="text-2xl font-semibold tracking-[-0.03em] transition-colors group-hover:text-primary">
                        {a.title}
                      </span>
                      <span className="self-center text-sm leading-relaxed text-muted-foreground">
                        {a.note}
                      </span>
                    </Link>
                  </Reveal>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Close --------------------------------------------------------------- */}
        <section className="border-t border-border/60 px-5 py-24 sm:px-8 sm:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <Reveal>
              <h2 className="text-3xl font-semibold tracking-[-0.035em] sm:text-5xl">
                Rung one is free.
                <br />
                <span className="text-gradient-brand">See the saving before you pay us anything.</span>
              </h2>
              <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
                <Link to="/auth" className="btn-gradient px-6 py-3 text-sm">
                  Start free
                </Link>
                <Link
                  to="/pricing"
                  className="inline-flex items-center gap-2 rounded-full border border-border px-6 py-3 text-sm font-semibold transition-colors hover:bg-muted"
                >
                  Compare the levels
                </Link>
              </div>
            </Reveal>
          </div>
        </section>
      </div>
    </MarketingShell>
  );
}
