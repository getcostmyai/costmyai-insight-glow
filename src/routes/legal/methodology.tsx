import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Reveal } from "@/components/marketing/Reveal";
import { marketingStatsQuery } from "@/lib/marketing.functions";

export const Route = createFileRoute("/legal/methodology")({
  head: () => ({
    meta: [
      { title: "Methodology — what counts as a price move, and how a switch is proven" },
      {
        name: "description",
        content:
          "The exact definition of a market price move, plus the cost function, the quality bar, the measurement margin, the tie-break rule and the refusal states behind every CostMyAI recommendation.",
      },
      {
        property: "og:title",
        content: "Methodology — what counts as a price move, and how a switch is proven",
      },
      {
        property: "og:description",
        content:
          "One published definition of a price move, one cost function, third-party benchmarks, a measured equivalence margin, and a deterministic tie-break. Written down so it can be checked.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:url", content: "https://www.costmyai.com/legal/methodology" },
    ],
    links: [{ rel: "canonical", href: "https://www.costmyai.com/legal/methodology" }],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(marketingStatsQuery()),
  component: MethodologyPage,
});

function formatTrackingSince(iso: string | null): string {
  if (!iso) return "our first recorded observation";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "our first recorded observation";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

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
    body: "When nothing clears, you get the refusal and its reason: no baseline price, no baseline score, benchmark not discriminating, nothing cheaper clearing the bar, latency ceiling unmet, or a saving too small to be worth a switch. Refusals are a product surface, not an error state.",
  },
  {
    title: "Freshness",
    body: "Prices and benchmark margins come from public feeds that re-sync continuously. Coverage figures shown publicly are read from the same tables the engine prices against, and are only labelled live once a sync has actually completed. Inside your workspace, every figure carries the timestamp of the run it came from.",
  },
  {
    title: "What we never hold",
    body: "No provider API keys, no prompts, no completions, no user content. The Verification Engine runs in your environment; what reaches us is aggregate metadata only, and the ingest schema rejects anything else.",
  },
  {
    title: "Retention",
    body: "The aggregate usage records pushed by the Verification Engine, and the rollups and recommendations derived from them, are kept for as long as your workspace exists, because a savings figure is only auditable against the history it was computed from. Close your workspace, or ask us to delete it, and that data is removed within 30 days. Public market data — model prices, benchmark scores and their change history — is not customer data and is kept permanently as a public record.",
  },
];

function MethodologyPage() {
  const { data: stats } = useSuspenseQuery(marketingStatsQuery());
  const trackingSince = formatTrackingSince(stats.trackingSince);
  return (
    <MarketingShell>
      <div className="flex flex-col">
        <section className="relative overflow-hidden border-b border-border">
          <div
            className="pointer-events-none absolute inset-x-0 -top-24 h-[130%] mesh-brand mesh-drift"
            aria-hidden
          />
          <div className="absolute inset-0 texture-dots opacity-50" aria-hidden />
          <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-24 sm:px-8 sm:pb-20 sm:pt-32">
            <Reveal className="max-w-4xl">
              <p className="eyebrow">Methodology</p>
              <h1 className="mt-5 text-5xl font-semibold leading-[1.03] tracking-[-0.045em] sm:text-7xl">
                How a switch gets <span className="text-gradient-brand-wide">proven</span>.
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
                A recommendation you cannot audit is a guess with a dollar sign in front of it. This
                is the whole decision procedure, written down so it can be checked.
              </p>
            </Reveal>
          </div>
        </section>

        <section className="wash-brand px-5 pb-28 pt-24 sm:px-8 sm:pb-36">
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
              <li id="price-move" className="scroll-mt-28">
                <Reveal>
                  <div className="grid gap-5 py-12 sm:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] sm:gap-14">
                    <div className="flex items-baseline gap-5">
                      <span className="select-none text-4xl font-semibold tabular-nums tracking-[-0.04em] text-muted-foreground/25">
                        {String(SECTIONS.length + 1).padStart(2, "0")}
                      </span>
                      <h2 className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
                        What counts as a price move
                      </h2>
                    </div>
                    <div className="space-y-4 self-center text-[1.0625rem] leading-[1.75] text-muted-foreground">
                      <p>
                        A price move is one observed change to a live listed price for a model on a
                        specific host, recorded with its direction (increase or decrease).
                      </p>
                      <p>
                        A model or host appearing for the first time is not a move. A delisting is
                        not a move. A model or host reappearing after being delisted is also not a
                        move. All three are excluded from the count.
                      </p>
                      <p>
                        Moves are counted between two of our own pricing syncs, so the number
                        reflects what we actually caught, not what a provider announced. A price
                        that changes and reverts between two syncs is invisible to us.
                      </p>
                      <p>
                        The counter covers the current calendar month in UTC and resets on the 1st.
                        The underlying ledger is append-only and permanent — rows cannot be deleted,
                        edited, pruned, or archived — so the window is a read choice, not data loss.
                      </p>
                      <p>Coverage started on {trackingSince}.</p>
                    </div>
                  </div>
                </Reveal>
              </li>
            </ul>
          </div>
        </section>

        <section className="relative overflow-hidden border-t border-border/60 px-5 py-24 sm:px-8 sm:py-32">
          <div className="pointer-events-none absolute inset-0 mesh-brand mesh-drift" aria-hidden />
          <div className="relative mx-auto max-w-3xl text-center">
            <Reveal>
              <h2 className="text-3xl font-semibold tracking-[-0.035em] sm:text-5xl">
                Every rule above runs on a live catalog.
                <br />
                <span className="text-gradient-brand-wide">See it applied to real prices.</span>
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
