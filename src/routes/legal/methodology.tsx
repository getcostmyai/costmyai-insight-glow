import { createFileRoute, Link } from "@tanstack/react-router";

import { MarketingShell } from "@/components/marketing/MarketingShell";

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
      <section className="wash-hero">
        <div className="mx-auto max-w-3xl px-5 py-20 sm:px-8">
          <p className="eyebrow">Methodology</p>
          <h1 className="mt-3 text-4xl font-bold tracking-[-0.03em] sm:text-5xl">
            How a switch gets proven.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
            A recommendation you cannot audit is a guess with a dollar sign in front of it. This is
            the whole decision procedure, written down so it can be checked.
          </p>

          <div className="mt-12 space-y-4">
            {SECTIONS.map((s) => (
              <div key={s.title} className="card-surface p-6">
                <h2 className="text-lg font-semibold tracking-tight">{s.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>

          <p className="mt-10 text-sm text-muted-foreground">
            See it applied to a live catalog on the{" "}
            <Link to="/models" className="font-semibold text-primary">
              models page
            </Link>
            .
          </p>
        </div>
      </section>
    </MarketingShell>
  );
}
