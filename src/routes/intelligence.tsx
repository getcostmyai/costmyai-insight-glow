import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, ArrowRight, Gauge, Layers, Scale, ShieldCheck, Timer } from "lucide-react";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { BOOK_DEMO_URL } from "@/lib/marketing-links";

export const Route = createFileRoute("/intelligence")({
  head: () => ({
    meta: [
      { title: "Intelligence — how CostMyAI measures a switch" },
      {
        name: "description",
        content:
          "The measurement layer behind every recommendation: live price sync, independent benchmark scores, the equivalence band, measurement margin and refusals with reasons.",
      },
      { property: "og:title", content: "Intelligence — how CostMyAI measures a switch" },
      {
        property: "og:description",
        content:
          "Price sync, benchmark scores, equivalence bands and measurement margin — every claim states the measurement it rests on.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: IntelligencePage,
});

const PILLARS = [
  {
    icon: Activity,
    title: "Live price sync",
    body: "Per-host prices refresh continuously from public provider feeds. A recommendation is priced against the catalog as it stands the moment you see it — not a quarterly snapshot.",
  },
  {
    icon: Scale,
    title: "Independent benchmark scores",
    body: "Quality comes from published third-party evaluations, per task class. We do not run our own private eval and we are never paid for placement.",
  },
  {
    icon: Layers,
    title: "The equivalence band",
    body: "A candidate model only qualifies when its score sits inside the band around your current model for the task class in question. Cheaper-but-worse never clears.",
  },
  {
    icon: Gauge,
    title: "Measurement margin",
    body: "Every score carries its own uncertainty. We compute the real margin and require the gap to survive it before a switch is offered.",
  },
  {
    icon: Timer,
    title: "Latency ceilings",
    body: "Median latency is part of the decision, not an afterthought. Set a ceiling and candidates that breach it are dropped before cost is even compared.",
  },
  {
    icon: ShieldCheck,
    title: "Refusals with reasons",
    body: "When nothing clears, you get a stated reason — not a weaker suggestion. A quiet downgrade would cost you more than the saving is worth.",
  },
] as const;

const STEPS = [
  {
    n: "01",
    title: "Read the metadata",
    body: "Your gateway pushes model, tokens, latency and cost. No prompts, no completions, no provider keys — ever.",
  },
  {
    n: "02",
    title: "Price the same work elsewhere",
    body: "The exact model you ran, repriced across every host we track, using one unified cost formula.",
  },
  {
    n: "03",
    title: "Test for equivalence",
    body: "Candidate models are filtered by task-class score, equivalence band, measurement margin and latency ceiling.",
  },
  {
    n: "04",
    title: "Rank by cost, state the basis",
    body: "The cheapest option that clears the bar wins; ties break on cost, then model ID. Every claim shows the evaluation behind it.",
  },
] as const;

function IntelligencePage() {
  return (
    <MarketingShell>
      <section className="px-5 pb-14 pt-16 sm:px-8 sm:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="eyebrow">Intelligence</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
            A switch is only worth taking if it can be{" "}
            <span className="text-primary">measured</span>.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
            CostMyAI never guesses at quality. Every recommendation is a priced, scored,
            margin-checked claim — and when the numbers do not clear, we say no out loud.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/auth" className="btn-gradient px-5 py-2.5 text-sm">
              Start free
            </Link>
            <a
              href={BOOK_DEMO_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              Book a Demo
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-card px-5 py-14 sm:px-8">
        <div className="mx-auto grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PILLARS.map((p) => (
            <div key={p.title} className="rounded-2xl border border-border bg-background p-6">
              <p.icon className="h-5 w-5 text-primary" />
              <h2 className="mt-4 text-sm font-semibold">{p.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-5 py-16 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-2xl font-semibold tracking-tight">From metadata to a decision</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <div key={s.n} className="rounded-2xl border border-border p-6">
                <p className="num text-2xl font-semibold tabular-nums text-primary">{s.n}</p>
                <h3 className="mt-3 text-sm font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link
              to="/models"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              See the live catalog the engine prices against
              <ArrowRight className="h-4 w-4" />
            </Link>
            <span className="text-muted-foreground">·</span>
            <Link
              to="/legal/methodology"
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Read the full methodology
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
