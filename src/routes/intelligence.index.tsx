import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Reveal } from "@/components/marketing/Reveal";
import { PriceDriftRibbon } from "@/components/marketing/PriceDriftRibbon";

import {
  HeroCta,
  HeroFigures,
  IntelligenceReport,
  type ReportContext,
} from "@/components/marketing/IntelligenceReport";
import { intelligenceQuery } from "@/lib/intelligence.functions";

/**
 * The live page. It recomputes on every request for the still-open month —
 * Phase 3 did not change that. What it adds is a citation target: every share
 * control points at the newest frozen month, never at these moving numbers.
 */
export const Route = createFileRoute("/intelligence/")({
  head: () => ({
    meta: [
      { title: "Intelligence — live AI price and quality market data | CostMyAI" },
      {
        name: "description",
        content:
          "Live market intelligence on the AI model economy: models and providers tracked, price moves this month, multi-provider price spreads and the cheapest model clearing each measured quality band.",
      },
      { property: "og:title", content: "Intelligence — the live AI price and quality market" },
      {
        property: "og:description",
        content:
          "Price moves this month, provider-to-provider spreads on identical weights, and quality-per-dollar winners inside measured benchmark margins.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://www.costmyai.com/intelligence" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://www.costmyai.com/intelligence" }],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(intelligenceQuery()),
  component: IntelligencePage,
});

function IntelligencePage() {
  const { data: live } = useSuspenseQuery(intelligenceQuery());
  const ctx: ReportContext = {
    frozenMonth: null,
    citableMonth: live.citableMonth,
    archive: live.archive,
    shareCitation: { kind: "live", generatedAt: live.data.generatedAt },
  };

  return (
    <MarketingShell>
      <IntelligenceReport
        data={live.data}
        ctx={ctx}
        hero={
          <section className="relative overflow-hidden border-b border-border">
            <div
              className="pointer-events-none absolute inset-x-0 -top-24 h-[130%] mesh-brand mesh-drift"
              aria-hidden
            />
            {/* First sighting of the band: a shallow diagonal, almost gone. */}
            <PriceDriftRibbon
              moves={live.data.changesTotal}
              orientation="diagonal"
              className="absolute inset-x-0 bottom-0 h-[55%] opacity-[0.12] [mask-image:linear-gradient(180deg,transparent,#000_70%)]"
            />
            <div className="absolute inset-0 texture-dots opacity-50" aria-hidden />

            <div className="relative mx-auto max-w-6xl px-5 pb-20 pt-24 sm:px-8 sm:pb-24 sm:pt-36">
              <Reveal className="max-w-4xl">
                <p className="eyebrow">Intelligence</p>
                <h1 className="mt-5 text-5xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-7xl">
                  The market moves.
                  <br />
                  We <span className="text-gradient-brand-wide">prove</span> by how much.
                </h1>
                <p className="mt-7 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
                  Every number on this page is computed from the same live catalog and the same
                  measured benchmark instruments the switching engine runs on. Nothing here is
                  estimated.
                </p>
                <p className="mt-5 max-w-2xl text-sm leading-relaxed text-muted-foreground/90">
                  What this is: a public monthly record of what AI model prices actually did, which
                  providers moved them, and which model is still the cheapest one good enough for a
                  given job. Free to read, free to cite.
                </p>
                {/* The claim above is a freshness claim, so it carries its own clock. */}
                <p className="mt-4 text-xs text-muted-foreground/80" suppressHydrationWarning>
                  Computed {new Date(live.data.generatedAt).toISOString().slice(0, 16).replace("T", " ")} UTC
                </p>
                <HeroCta />

              </Reveal>
              <HeroFigures data={live.data} ctx={ctx} />
            </div>
          </section>

        }
      />
    </MarketingShell>
  );
}
