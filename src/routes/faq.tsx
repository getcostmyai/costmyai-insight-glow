import { createFileRoute, Link } from "@tanstack/react-router";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Reveal } from "@/components/marketing/Reveal";
import { BOOK_DEMO_URL } from "@/lib/marketing-links";
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
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FaqPage,
});

function FaqPage() {
  return (
    <MarketingShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqJsonLd() }} />

      <div className="flex flex-col">
        <section className="wash-hero px-5 pb-16 pt-24 sm:px-8 sm:pb-20 sm:pt-32">
          <div className="mx-auto max-w-6xl">
            <Reveal className="max-w-4xl">
              <p className="eyebrow">FAQ</p>
              <h1 className="mt-5 text-5xl font-semibold leading-[1.03] tracking-[-0.045em] sm:text-7xl">
                The questions people
                <br />
                actually <span className="text-gradient-brand">search for</span>.
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
                Not invented questions with convenient answers. These are the ones teams running AI
                at real scale ask about cost, about switching safely, and about who gets to hold
                their credentials. Answers first, no hedging.
              </p>
            </Reveal>

            <Reveal delay={120}>
              <nav
                aria-label="FAQ sections"
                className="mt-16 grid gap-x-10 gap-y-4 border-t border-border/60 pt-10 sm:grid-cols-2 lg:grid-cols-4"
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
            className={`scroll-mt-24 border-t border-border/60 px-5 py-24 sm:px-8 sm:py-32 ${
              ci % 2 === 1 ? "wash-section" : ""
            }`}
          >
            <div className="mx-auto max-w-6xl">
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

        <section className="border-t border-border/60 px-5 py-24 sm:px-8 sm:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <Reveal>
              <p className="eyebrow">{FAQ_ITEMS.length} answers, no asterisks</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] sm:text-5xl">
                Now see the same rigor
                <br />
                <span className="text-gradient-brand">on your own spend.</span>
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
