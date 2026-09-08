import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Reveal } from "@/components/marketing/Reveal";
import { PriceDriftRibbon } from "@/components/marketing/PriceDriftRibbon";
import { BOOK_DEMO_URL } from "@/lib/marketing-links";
import { marketingStatsQuery } from "@/lib/marketing.functions";
import { FAQ_CLUSTERS, FAQ_ITEMS, faqJsonLd } from "@/lib/faq/questions";

const TITLE = "AI cost FAQ — pricing, safe model switching, key security";
const DESCRIPTION =
  "Straight answers on what AI actually costs, why bills rise while token prices fall, how to switch models without losing quality, and why no tool should ever hold your provider keys.";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://www.costmyai.com/faq" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://www.costmyai.com/faq" }],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(marketingStatsQuery()),
  component: FaqPage,
});

function FaqPage() {
  const { data: stats } = useSuspenseQuery(marketingStatsQuery());
  return (
    <MarketingShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqJsonLd() }} />

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
              <p className="eyebrow">FAQ</p>
              <h1 className="mt-5 text-5xl font-semibold leading-[1.03] tracking-[-0.045em] sm:text-7xl">
                Straight answers
                <br />
                about <span className="text-gradient-brand-wide">what AI costs</span>.
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
                Real questions from teams running AI at real scale: why the bill keeps climbing,
                how to move to a cheaper model without losing quality, who ends up holding your
                credentials, and what it takes to start. Answer first, no hedging, no asterisks.
              </p>
            </Reveal>

            <Reveal delay={120}>
              <nav
                aria-label="FAQ sections"
                className="mt-16 grid gap-x-10 gap-y-4 border-t border-border/60 pt-10 sm:grid-cols-2 lg:grid-cols-3"
              >
                {FAQ_CLUSTERS.map((c, i) => (
                  <a
                    key={c.id}
                    href={`#${c.id}`}
                    className="group flex items-baseline gap-4 text-[1.0625rem] font-semibold tracking-[-0.02em] transition-colors hover:text-primary"
                  >
                    <span className="num text-[11px] tracking-[0.18em] text-primary">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span>{c.title}</span>
                  </a>
                ))}
              </nav>
            </Reveal>
          </div>
        </section>

        {FAQ_CLUSTERS.map((cluster, ci) => (
          <section
            key={cluster.id}
            id={cluster.id}
            className={`relative overflow-hidden scroll-mt-24 border-t border-border/60 px-5 py-24 sm:px-8 sm:py-32 ${
              ci % 2 === 1 ? "wash-brand" : ""
            }`}
          >
            {ci === 1 ? (
              <PriceDriftRibbon
                moves={stats.priceChangesTracked}
                orientation="vertical"
                className="absolute inset-y-0 right-0 hidden w-[14%] opacity-[0.18] [mask-image:linear-gradient(270deg,#000,transparent)] lg:block"
              />
            ) : null}

            <div className="relative mx-auto max-w-6xl">
              <Reveal className="max-w-3xl">
                <p className="eyebrow">{String(ci + 1).padStart(2, "0")}</p>
                <h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">
                  {cluster.title}
                </h2>
                <p className="mt-6 text-[1.0625rem] leading-[1.75] text-muted-foreground">
                  {cluster.lead}
                </p>
              </Reveal>

              <ul className="mt-14 divide-y divide-border/60 border-t border-border/60">
                {cluster.items.map((item, i) => (
                  <li key={item.id} id={item.id} className="scroll-mt-24">
                    <Reveal delay={Math.min(i, 4) * 40}>
                      <div className="grid gap-5 py-12 sm:grid-cols-[minmax(0,1fr)_minmax(0,36rem)] sm:gap-14">
                        <h3 className="text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">
                          <a href={`#${item.id}`} className="transition-colors hover:text-primary">
                            {item.q}
                          </a>
                        </h3>
                        <p className="text-[1.0625rem] leading-[1.75] text-muted-foreground">
                          {item.a}
                        </p>
                      </div>
                    </Reveal>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ))}

        <section className="relative overflow-hidden border-t border-border/60 px-5 py-24 sm:px-8 sm:py-32">
          <div className="pointer-events-none absolute inset-0 mesh-brand mesh-drift" aria-hidden />
          <PriceDriftRibbon
            moves={stats.priceChangesTracked}
            className="absolute inset-x-0 bottom-0 h-[26%] opacity-25 [mask-image:linear-gradient(180deg,transparent_0%,transparent_70%,#000_100%)]"
          />
          <div className="relative mx-auto max-w-3xl text-center">
            <Reveal>
              <p className="eyebrow">{FAQ_ITEMS.length} answers, no asterisks</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] sm:text-5xl">
                Now see the same rigor
                <br />
                <span className="text-gradient-brand-wide">on your own spend.</span>
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
