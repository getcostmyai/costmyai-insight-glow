import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Reveal } from "@/components/marketing/Reveal";
import {
  BandExplainer,
  ProofMatrix,
  RungSelfAssessment,
  RungStack,
} from "@/components/marketing/StandardVisuals";
import { intelligenceQuery } from "@/lib/intelligence.functions";
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
    note: "Why AI spend became its own discipline — the context rung one exists to fix.",
  },
  {
    slug: "ai-cost-governance-101",
    title: "AI cost governance 101: building visibility before finance asks",
    note: "Tracking is not forecasting. The visibility work that sits under rung one.",
  },
  {
    slug: "benchmark-backed-model-switching",
    title: "Benchmark-backed model switching: why cheaper isn't automatically safe",
    note: "The equivalence mechanic behind rung two, in full.",
  },
  {
    slug: "ai-cost-governance-framework",
    title: "The AI Cost Governance Framework: a guide for engineering teams",
    note: "The long-form walkthrough of all four rungs for engineering teams.",
  },
];

export const Route = createFileRoute("/standard")({
  head: () => ({
    meta: [
      { title: "The CostMyAI Standard — AI spend governance framework" },
      {
        name: "description",
        content:
          "The CostMyAI Standard: a four-rung AI spend governance framework built on proof, not estimation. Compare, Certify, Rightsize, Govern — and what each rung has to prove.",
      },
      {
        name: "keywords",
        content: "AI spend governance framework, AI cost management, cost governance framework",
      },
      { property: "og:title", content: "The CostMyAI Standard" },
      {
        property: "og:description",
        content:
          "The AI spend governance framework built on proof, not estimation. Four rungs, one proof requirement each, and a refusal when the evidence is missing.",
      },
      { property: "og:type", content: "article" },
      { property: "og:url", content: "/standard" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "/standard" }],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(intelligenceQuery()),
  component: StandardPage,
});

function StandardPage() {
  const { data: live } = useSuspenseQuery(intelligenceQuery());
  const winner = live.data.bandWinners[0] ?? ILLUSTRATIVE_BAND;
  const isLiveBand = Boolean(live.data.bandWinners[0]);

  return (
    <MarketingShell>
      <div className="flex flex-col">
        {/* Title + version stamp -------------------------------------------- */}
        <section className="wash-hero px-5 pb-14 pt-24 sm:px-8 sm:pb-16 sm:pt-32">
          <div className="mx-auto max-w-6xl">
            <Reveal className="max-w-4xl">
              <p className="eyebrow">The Standard</p>
              <h1 className="mt-5 text-5xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-7xl">
                The CostMyAI <span className="text-gradient-brand">Standard</span>
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
                The AI spend governance framework built on proof, not estimation.
              </p>
              <p className="mt-8 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                <span className="num">{VERSION}</span> · Last updated {UPDATED}
              </p>
            </Reveal>
          </div>
        </section>

        {/* Hero visual: the four-level stack -------------------------------- */}
        <section className="px-5 pb-24 sm:px-8 sm:pb-32">
          <div className="mx-auto max-w-6xl">
            <RungStack />
            <Reveal delay={120}>
              <p className="mt-10 max-w-3xl text-[1.0625rem] leading-[1.75] text-muted-foreground">
                Four levels, in order. Each one is defined by the evidence it requires, not by the
                saving it promises. You cannot stand on a higher rung than your evidence supports —
                and a rung you cannot evidence is not a strategy, it is a guess with a dollar sign
                in front of it.
              </p>
            </Reveal>
          </div>
        </section>

        {/* Rung 2 mechanic, shown ------------------------------------------- */}
        <section className="border-t border-border/60 px-5 py-24 sm:px-8 sm:py-32">
          <div className="mx-auto max-w-6xl">
            <Reveal className="max-w-3xl">
              <p className="eyebrow">Rung 2 · the mechanic</p>
              <h2 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
                The cheapest model that clears the bar.
                <br />
                <span className="text-muted-foreground/60">Not the best-scoring one.</span>
              </h2>
              <p className="mt-7 text-[1.0625rem] leading-[1.75] text-muted-foreground">
                The bar is the leader&apos;s score minus that evaluation&apos;s own measured margin.
                Everything inside that band is statistically indistinguishable from the leader, so
                within it price is the only remaining variable — and the cheapest qualifier wins. If
                every model sits inside the margin, the benchmark cannot discriminate and must not
                be used to justify anything.
              </p>
            </Reveal>

            <Reveal delay={80} className="mt-12">
              <div className="flex flex-wrap items-baseline justify-between gap-4">
                <p className="text-sm font-medium">
                  {isLiveBand ? (
                    <>
                      Live band · {winner.taskClass}{" "}
                      <span className="text-muted-foreground">({winner.suite})</span>
                    </>
                  ) : (
                    "Illustrative band"
                  )}
                </p>
                <p className="text-[0.7rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  {isLiveBand ? "from the live catalog" : "no discriminating band published yet"}
                </p>
              </div>
              <BandExplainer winner={winner} live={isLiveBand} />
            </Reveal>
          </div>
        </section>

        {/* What each rung has to prove -------------------------------------- */}
        <section className="border-t border-border/60 px-5 py-24 sm:px-8 sm:py-32">
          <div className="mx-auto max-w-6xl">
            <Reveal className="max-w-3xl">
              <p className="eyebrow">Evidence</p>
              <h2 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
                What each rung has to <span className="text-gradient-brand">prove</span>.
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
              <p className="eyebrow">The corollary</p>
              <h2 className="mt-5 text-4xl font-semibold leading-[1.06] tracking-[-0.04em] sm:text-6xl">
                When the evidence is missing, the correct output is a{" "}
                <span className="text-gradient-brand">refusal</span> — never an estimate.
              </h2>
              <p className="mt-8 max-w-2xl text-[1.0625rem] leading-[1.75] text-muted-foreground">
                No baseline price, no baseline score, a benchmark that cannot discriminate, nothing
                cheaper clearing the bar, a latency ceiling unmet, a saving below the materiality
                floor: each of those is a stated refusal with its reason attached. Refusals are a
                product surface, not an error state, and they are the reason the recommendations
                that do appear can be audited.
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
                Two questions locate you on the ladder.
              </h2>
              <p className="mt-7 text-[1.0625rem] leading-[1.75] text-muted-foreground">
                Answer them honestly. The result is the highest rung your evidence currently
                supports — not the one you would like to be on.
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
