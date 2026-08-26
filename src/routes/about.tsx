import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Reveal, CountUp } from "@/components/marketing/Reveal";
import { PriceDriftRibbon } from "@/components/marketing/PriceDriftRibbon";
import { marketingStatsQuery } from "@/lib/marketing.functions";
import { BOOK_DEMO_URL } from "@/lib/marketing-links";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About CostMyAI — Financial Governance for AI spend" },
      {
        name: "description",
        content:
          "The same task can cost a hundred times more on one provider than another, at identical output quality. CostMyAI proves when a cheaper switch is safe, and refuses when it cannot.",
      },
      { property: "og:title", content: "About CostMyAI — Financial Governance for AI spend" },
      {
        property: "og:description",
        content:
          "Four levels of AI cost control, built on public prices and independent benchmarks. We never hold your provider keys.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(marketingStatsQuery()),
  component: AboutPage,
});

const LEVELS = [
  {
    name: "Compare",
    body: "The same model, cheaper somewhere else. No benchmark needed, because the weights and the output are identical. Free.",
  },
  {
    name: "Certify",
    body: "A different model, priced against an independent third party benchmark, recommended only when its measured quality sits inside a real equivalence band around what you run today.",
  },
  {
    name: "Rightsize",
    body: "The models running work far below their capability. We find them, and show you what fixing that is worth on your own token mix.",
  },
  {
    name: "Govern",
    body: "All of it autonomously, inside guardrails you set, re-checked at the moment of action rather than at the moment of evaluation.",
  },
];

function AboutPage() {
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
              <p className="eyebrow">About</p>
              <h1 className="mt-5 text-5xl font-semibold leading-[1.03] tracking-[-0.045em] sm:text-7xl">
                The gap nobody sees
                <br />
                until the <span className="text-gradient-brand-wide">invoice</span>.
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
                The same task, run through different AI models, can cost more than a hundred times
                more on one provider than another. Same output quality. Different bill. Most teams
                find this out after the invoice, not before. CostMyAI exists to fix that before it
                happens, not explain it after.
              </p>
            </Reveal>

            <Reveal delay={120}>
              <dl className="mt-16 grid gap-10 border-t border-border/60 pt-10 sm:grid-cols-3">
                <Figure
                  label="Models priced"
                  value={<CountUp value={stats.modelCount} />}
                />
                <Figure
                  label="Serving providers"
                  value={<CountUp value={stats.providerCount} />}
                />
                <Figure
                  label={
                    <Link
                      to="/legal/methodology"
                      hash="price-move"
                      className="underline-offset-4 hover:underline hover:text-foreground"
                    >
                      Price moves caught this month
                    </Link>
                  }
                  value={<CountUp value={stats.priceChangesTracked} />}
                />
              </dl>
            </Reveal>
          </div>
        </section>

        <section className="px-5 py-24 sm:px-8 sm:py-32">
          <div className="mx-auto max-w-6xl">
            <Reveal className="max-w-3xl">
              <h2 className="text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">
                What we actually do
              </h2>
              <p className="mt-6 text-[1.0625rem] leading-[1.75] text-muted-foreground">
                CostMyAI is a Financial Governance platform for AI spend. Not a dashboard that shows
                you what you already paid. A system that tells you, with proof, when a cheaper
                switch is safe and when it is not, and applies it for you if you want it to.
              </p>
            </Reveal>

            <ul className="mt-14 divide-y divide-border/60 border-t border-border/60">
              {LEVELS.map((l, i) => (
                <li key={l.name}>
                  <Reveal delay={Math.min(i, 4) * 40}>
                    <div className="grid gap-5 py-12 sm:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] sm:gap-14">
                      <div className="flex items-baseline gap-5">
                        <span className="select-none text-4xl font-semibold tabular-nums tracking-[-0.04em] text-muted-foreground/25">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <h3 className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
                          {l.name}
                        </h3>
                      </div>
                      <p className="self-center text-[1.0625rem] leading-[1.75] text-muted-foreground">
                        {l.body}
                      </p>
                    </div>
                  </Reveal>
                </li>
              ))}
            </ul>

            <Reveal>
              <p className="mt-14 max-w-3xl text-[1.0625rem] leading-[1.75] text-muted-foreground">
                We never hold your provider keys. The system that reads your usage runs inside your
                own environment. That is not a feature we added, it is the only way we were willing
                to build this.
              </p>
            </Reveal>
          </div>
        </section>

        <section className="relative overflow-hidden wash-brand border-t border-border/60 px-5 py-24 sm:px-8 sm:py-32">
          <PriceDriftRibbon
            moves={stats.priceChangesTracked}
            orientation="vertical"
            className="absolute inset-y-0 right-0 hidden w-[14%] opacity-[0.18] [mask-image:linear-gradient(270deg,#000,transparent)] lg:block"
          />
          <div className="relative mx-auto grid max-w-6xl gap-14 sm:grid-cols-2">
            <Reveal>
              <h2 className="text-3xl font-semibold tracking-[-0.035em] sm:text-5xl">
                Why this exists
              </h2>
              <p className="mt-6 text-[1.0625rem] leading-[1.75] text-muted-foreground">
                AI spend does not behave like software spend. It is variable cost, not a
                subscription. Most finance and engineering teams are still budgeting it like the old
                model, and getting surprised by the new one. That gap, between how AI actually bills
                and how most companies still think about it, is the whole reason CostMyAI exists.
              </p>
            </Reveal>
            <Reveal delay={80}>
              <h2 className="text-3xl font-semibold tracking-[-0.035em] sm:text-5xl">
                What we will not do
              </h2>
              <p className="mt-6 text-[1.0625rem] leading-[1.75] text-muted-foreground">
                We will not tell you a switch is safe when we cannot prove it. If a candidate model
                cannot clear an independent benchmark for your specific task, we say so, with the
                reason, instead of suggesting it anyway. A quieter downgrade would cost you more
                than the saving is worth, and we would rather show you a smaller number we can
                defend than a larger one we cannot.
              </p>
            </Reveal>
          </div>
        </section>

        <section className="relative overflow-hidden border-t border-border/60 px-5 py-24 sm:px-8 sm:py-32">
          <div className="pointer-events-none absolute inset-0 mesh-brand mesh-drift" aria-hidden />
          <PriceDriftRibbon
            moves={stats.priceChangesTracked}
            className="absolute inset-x-0 bottom-0 h-[26%] opacity-25 [mask-image:linear-gradient(180deg,transparent_0%,transparent_70%,#000_100%)]"
          />
          <div className="relative mx-auto max-w-3xl text-center">
            <Reveal>
              <h2 className="text-3xl font-semibold tracking-[-0.035em] sm:text-5xl">
                See it applied to
                <br />
                <span className="text-gradient-brand-wide">your own spend.</span>
              </h2>
              <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
                <Link to="/auth" className="btn-gradient px-6 py-3 text-sm">
                  Start free
                </Link>
                <a
                  href={BOOK_DEMO_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-2 rounded-full border border-border px-6 py-3 text-sm font-semibold transition-colors hover:bg-muted"
                >
                  Book a Demo
                </a>
              </div>
            </Reveal>
          </div>
        </section>
      </div>
    </MarketingShell>
  );
}

function Figure({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div>
      <dd className="text-5xl font-semibold tracking-[-0.045em] sm:text-6xl">{value}</dd>
      <dt className="mt-3 text-sm text-muted-foreground">{label}</dt>
    </div>
  );
}
