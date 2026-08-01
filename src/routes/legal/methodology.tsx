import { createFileRoute, Link } from "@tanstack/react-router";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Reveal } from "@/components/marketing/Reveal";

export const Route = createFileRoute("/legal/methodology")({
  head: () => ({
    meta: [
      { title: "Methodology — how CostMyAI proves a switch" },
      {
        name: "description",
        content:
          "The cost function, the quality bar, the measurement margin, the tie-break rule and the refusal states behind every CostMyAI recommendation.",
      },
      { property: "og:title", content: "Methodology — how CostMyAI proves a switch" },
      {
        property: "og:description",
        content:
          "One cost function, third-party benchmarks, a measured equivalence margin, and a deterministic tie-break. Written down so it can be checked.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MethodologyPage,
});

const SECTIONS = [
  {
    title: "One cost function",
    body: "Every price comparison in the product and on this website runs through a single function: input tokens times the input rate plus output tokens times the output rate, on your own observed token mix rather than a list-price headline. There is no second formula anywhere, because two formulas produce two different savings for the same switch.",
  },
  {
    title: "The quality bar",
    body: "A cheaper model is only offered when its third-party benchmark score clears your current model's score minus that evaluation's own measured margin, for that task class. The margin is synced alongside the scores it applies to — never a hardcoded tolerance, and never a number we choose.",
  },
  {
    title: "The discrimination guard",
    body: "If every model's score on a task class sits inside the measurement margin, the benchmark cannot tell them apart and must not be used to justify anything. We require the observed spread to exceed twice the margin before a quality claim is possible at all.",
  },
  {
    title: "The tie-break",
    body: "The cheapest option clearing the bar wins — not the highest-scoring, not a partner's. An exact price tie breaks alphabetically by model, then by host. The rule is fixed so no thumb can rest on the scale.",
  },
  {
    title: "Refusals",
    body: "When nothing clears, you get the refusal and its reason: no baseline price, no baseline score, benchmark not discriminating, nothing cheaper clearing the bar, latency ceiling unmet, or saving below the materiality floor. Refusals are a product surface, not an error state.",
  },
  {
    title: "Freshness",
    body: "Prices and benchmark margins come from public feeds that re-sync continuously. Coverage figures shown publicly are read from the same tables the engine prices against, and are only labelled live once a sync has actually completed. Inside your workspace, every figure carries the timestamp of the run it came from.",
  },
  {
    title: "What we never hold",
    body: "No provider API keys, no prompts, no completions, no user content. The Verification Engine runs in your environment; what reaches us is aggregate metadata only, and the ingest schema rejects anything else.",
  },
];

function MethodologyPage() {
  return (
    <MarketingShell>
      <div className="flex flex-col">
        <section className="wash-hero px-5 pb-16 pt-24 sm:px-8 sm:pb-20 sm:pt-32">
          <div className="mx-auto max-w-6xl">
            <Reveal className="max-w-4xl">
              <p className="eyebrow">Methodology</p>
              <h1 className="mt-5 text-5xl font-semibold leading-[1.03] tracking-[-0.045em] sm:text-7xl">
                How a switch gets <span className="text-gradient-brand">proven</span>.
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
                A recommendation you cannot audit is a guess with a dollar sign in front of it. This
                is the whole decision procedure, written down so it can be checked.
              </p>
            </Reveal>
          </div>
        </section>

        <section className="px-5 pb-28 sm:px-8 sm:pb-36">
          <div className="mx-auto max-w-6xl">
            <ul className="divide-y divide-border/60 border-t border-border/60">
              {SECTIONS.map((s, i) => (
                <li key={s.title}>
                  <Reveal delay={Math.min(i, 6) * 40}>
                    <div className="grid gap-5 py-12 sm:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] sm:gap-14">
                      <div className="flex items-baseline gap-5">
                        <span className="select-none text-4xl font-semibold tabular-nums tracking-[-0.04em] text-muted-foreground/25">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <h2 className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
                          {s.title}
                        </h2>
                      </div>
                      <p className="self-center text-[1.0625rem] leading-[1.75] text-muted-foreground">
                        {s.body}
                      </p>
                    </div>
                  </Reveal>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-t border-border/60 px-5 py-24 sm:px-8 sm:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <Reveal>
              <h2 className="text-3xl font-semibold tracking-[-0.035em] sm:text-5xl">
                Every rule above runs on a live catalog.
                <br />
                <span className="text-gradient-brand">See it applied to real prices.</span>
              </h2>
              <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
                <Link to="/models" className="btn-gradient px-6 py-3 text-sm">
                  Browse the models catalog
                </Link>
                <Link
                  to="/intelligence"
                  className="inline-flex items-center gap-2 rounded-full border border-border px-6 py-3 text-sm font-semibold transition-colors hover:bg-muted"
                >
                  This month in the market
                </Link>
              </div>
            </Reveal>
          </div>
        </section>
      </div>
    </MarketingShell>
  );
}
