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
                Press and <span className="text-gradient-brand-wide">media</span>.
              </h1>
              <p className="mt-7 max-w-3xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
                Everything needed to write about CostMyAI accurately: boilerplate you can paste, how
                to name us, what our numbers mean, and where to cite them from. Logo files and
                approved screenshots are sent on request, same working day.
              </p>
            </Reveal>
          </div>
        </section>

        <section className="px-5 pb-28 sm:px-8 sm:pb-36">
          <div className="mx-auto max-w-6xl">
            <ul className="divide-y divide-border/60 border-t border-border/60">
              <Block title="Boilerplate">
                <span className="text-foreground">
                  CostMyAI is a Financial Governance platform for AI spend. It measures what an
                  organization actually pays across every model and provider it uses, then certifies
                  which workloads can move to a cheaper model without losing quality. It never takes
                  custody of provider API keys: the component that reads usage runs inside the
                  customer's own environment. CostMyAI is built in Vienna, Austria.
                </span>{" "}
                Copy that paragraph as is. It is the wording we can stand behind.
              </Block>
              <Block title="How to name us">
                CostMyAI, one word, capital C, capital M, capital A, capital I. Not Cost My AI, not
                CostMyAi. The category is Financial Governance for AI spend, not AI cost tracking:
                tracking reports what already happened, governance decides what happens next.
              </Block>
              <Block title="Why the category exists">
                AI spend behaves like variable cost, not subscription cost, and most organizations
                still manage it like the old model. A price per token that falls every quarter does
                nothing for a bill that rises because agentic workloads consume ten to thirty times
                more tokens per completed task. CostMyAI reads real billed usage from inside the
                customer's environment and applies switching decisions backed by independent,
                published benchmarks rather than a private evaluation or a paid placement.
              </Block>
              <Block title="The claim worth checking">
                CostMyAI publishes its own refusal rate: the share of evaluated switches it will not
                recommend, because the evidence does not clear the quality bar. Every other platform
                in this category publishes only the switches that look good. If a cheaper model
                cannot be proven equivalent for that exact task, the honest output is no
                recommendation, and we show how often that happens.
              </Block>
              <Block title="The origin">
                Built in Vienna, as a solo build. The founder spent over a decade running a seven
                figure arts organization, then years in enterprise SaaS sales at C-level, and saw
                the same pattern in two completely different rooms: a gap between what people think
                something costs and what it actually costs, and how much money hides in that gap
                once nobody is watching closely. AI spend turned out to be the largest version of
                that gap. CostMyAI exists to close it before the invoice, not explain it after.
              </Block>
              <Block title="Citing our data">
                Live pricing, benchmark and market structure figures update continuously, so a live
                page will not match what you quoted by the time you publish. Cite the frozen, dated
                monthly snapshot instead: each edition of{" "}
                <Link
                  to="/intelligence"
                  className="font-semibold text-foreground underline underline-offset-4 transition-colors hover:text-primary"
                >
                  Intelligence
                </Link>{" "}
                stays accurate to the day it was published.
              </Block>
              <Block title="Assets and interviews">
                There is no downloadable bundle on this page yet. Email us and you get logo files,
                approved product screenshots and founder availability the same working day. Say what
                you are writing and the deadline you are working to.
              </Block>
              <Block title="Media contact">
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
                  Request assets or an interview
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
