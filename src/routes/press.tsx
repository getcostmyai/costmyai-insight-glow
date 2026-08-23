import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Reveal } from "@/components/marketing/Reveal";
import { PriceDriftRibbon } from "@/components/marketing/PriceDriftRibbon";
import { marketingStatsQuery } from "@/lib/marketing.functions";

export const Route = createFileRoute("/press")({
  head: () => ({
    meta: [
      { title: "Press kit — CostMyAI" },
      {
        name: "description",
        content:
          "CostMyAI is a neutral Financial Governance platform for AI spend. Boilerplate, origin, citation guidance and media contact for journalists and analysts.",
      },
      { property: "og:title", content: "Press kit — CostMyAI" },
      {
        property: "og:description",
        content:
          "The only platform in this category that publishes its own refusal rate. Boilerplate, origin and citation guidance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(marketingStatsQuery()),
  component: PressPage,
});

function PressPage() {
  const { data: stats } = useSuspenseQuery(marketingStatsQuery());
  return (
    <MarketingShell>
      <div className="flex flex-col">
        <section className="relative overflow-hidden border-b border-border">
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
          <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-24 sm:px-8 sm:pb-20 sm:pt-32">
            <Reveal className="max-w-4xl">
              <p className="eyebrow">Press</p>
              <h1 className="mt-5 text-5xl font-semibold leading-[1.03] tracking-[-0.045em] sm:text-7xl">
                Press <span className="text-gradient-brand-wide">kit</span>.
              </h1>
              <p className="mt-7 max-w-3xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
                CostMyAI is a neutral Financial Governance platform for AI spend. It never holds
                provider keys, and it refuses to recommend a switch it cannot prove is safe.
              </p>
            </Reveal>
          </div>
        </section>

        <section className="px-5 pb-28 sm:px-8 sm:pb-36">
          <div className="mx-auto max-w-6xl">
            <ul className="divide-y divide-border/60 border-t border-border/60">
              <Block title="The short version">
                AI spend behaves like variable cost, not subscription cost, and most organizations
                are still managing it like the old model. CostMyAI reads real usage from inside a
                customer's own environment, without ever taking custody of provider credentials, and
                applies switching decisions backed by independent, published benchmarks rather than a
                private evaluation or a paid placement.
              </Block>
              <Block title="What makes this different">
                CostMyAI is the only platform in this category that publishes its own refusal rate,
                the share of evaluated switches it will not recommend because the evidence does not
                clear the bar, rather than only publishing the switches that look good.
              </Block>
              <Block title="The origin">
                Built in Vienna. Started as a solo build by someone who spent over a decade running a
                seven figure arts organization before this, then years in enterprise SaaS sales at
                C-level, and noticed the same pattern in a completely different room: the gap between
                what people think something costs and what it actually costs, and how much money
                hides in that gap once nobody is watching closely enough. AI spend turned out to be
                the largest version of that gap. CostMyAI is built to close it before the invoice,
                not explain it after.
              </Block>
              <Block title="Data and citations">
                Journalists and analysts citing CostMyAI's own live pricing, benchmark, or market
                structure data should reference the frozen, dated snapshot at /intelligence/[month]
                rather than the live page, since the live figures update continuously and a frozen
                snapshot stays accurate to what was actually cited.
              </Block>
              <Block title="Assets">
                Logo files and approved screenshots are being prepared as a downloadable bundle. Until
                that bundle is published here, request assets directly by email and we will send them
                the same day.
              </Block>
              <Block title="Media inquiries">
                <a
                  href="mailto:mail@costmyai.com"
                  className="font-semibold text-foreground transition-colors hover:text-primary"
                >
                  mail@costmyai.com
                </a>
              </Block>
            </ul>

            <Reveal>
              <div className="mt-14 flex flex-wrap items-center gap-3">
                <a href="mailto:mail@costmyai.com" className="btn-gradient px-6 py-3 text-sm">
                  Request the press kit
                </a>
                <Link
                  to="/intelligence"
                  className="inline-flex items-center gap-2 rounded-full border border-border px-6 py-3 text-sm font-semibold transition-colors hover:bg-muted"
                >
                  Citable market data
                </Link>
              </div>
            </Reveal>
          </div>
        </section>
      </div>
    </MarketingShell>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li>
      <Reveal>
        <div className="grid gap-5 py-12 sm:grid-cols-[minmax(0,1fr)_minmax(0,38rem)] sm:gap-14">
          <h2 className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">{title}</h2>
          <p className="self-center text-[1.0625rem] leading-[1.75] text-muted-foreground">
            {children}
          </p>
        </div>
      </Reveal>
    </li>
  );
}
