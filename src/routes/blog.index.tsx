import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { PriceDriftRibbon } from "@/components/marketing/PriceDriftRibbon";
import { Reveal } from "@/components/marketing/Reveal";
import { formatPublished, postsNewestFirst } from "@/lib/blog/posts";
import { marketingStatsQuery } from "@/lib/marketing.functions";

/**
 * Blog index in the homepage design language: mesh hero, the price-drift band
 * as recurring artwork, hairline rails instead of cards, oversized type.
 */
export const Route = createFileRoute("/blog/")({
  head: () => ({
    meta: [
      { title: "Blog — AI cost governance, measured | CostMyAI" },
      {
        name: "description",
        content:
          "Field notes on Financial Governance for AI: what actually drives the bill, which savings are real, and which model switches can be proven safe before you make them.",
      },
      { property: "og:title", content: "AI spend, measured — the CostMyAI blog" },
      {
        property: "og:description",
        content:
          "How AI spend is actually measured, where model-equivalence claims fall apart, and which switches are provably safe.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://www.costmyai.com/blog" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://www.costmyai.com/blog" }],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(marketingStatsQuery()),
  component: BlogIndex,
});

function BlogIndex() {
  const { data: stats } = useSuspenseQuery(marketingStatsQuery());
  const moves = stats.priceChangesTracked;
  const posts = postsNewestFirst();
  const [lead, ...rest] = posts;

  return (
    <div className="flex flex-col">
      <section className="relative overflow-hidden border-b border-border">
        <div
          className="pointer-events-none absolute inset-x-0 -top-24 h-[130%] mesh-brand mesh-drift"
          aria-hidden
        />
        <PriceDriftRibbon
          moves={moves}
          orientation="diagonal"
          className="absolute inset-x-0 bottom-0 h-[45%] opacity-[0.11] [mask-image:linear-gradient(180deg,transparent,#000_75%)]"
        />
        <div className="absolute inset-0 texture-dots opacity-50" aria-hidden />

        <div className="relative mx-auto max-w-6xl px-5 pb-20 pt-24 sm:px-8 sm:pb-24 sm:pt-36">
          <Reveal className="max-w-4xl">
            <p className="eyebrow">Blog</p>
            <h1 className="mt-5 text-5xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-7xl">
              AI spend, <span className="text-gradient-brand-wide">measured</span>.
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
              Field notes on Financial Governance for AI: what actually drives the bill, which
              savings are real, and which switches can be proven safe before you make them.
            </p>
            <p className="mt-5 max-w-2xl text-sm leading-relaxed text-muted-foreground/90">
              Written against the same live catalog the switching engine runs on. Nothing here is
              estimated.
            </p>
          </Reveal>
        </div>
      </section>

      {lead ? (
        <section className="relative overflow-hidden border-b border-border wash-brand">
          <PriceDriftRibbon
            moves={moves}
            orientation="vertical"
            className="absolute inset-y-0 right-0 hidden w-[14%] opacity-[0.16] [mask-image:linear-gradient(270deg,#000,transparent)] lg:block"
          />
          <div className="relative mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
            <Reveal>
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-primary">
                Latest
              </p>
              <Link
                to="/blog/$slug"
                params={{ slug: lead.slug }}
                className="group mt-5 block max-w-4xl"
              >
                <h2 className="text-3xl font-semibold leading-[1.08] tracking-[-0.04em] transition-colors group-hover:text-primary sm:text-5xl">
                  {lead.title}
                </h2>
                <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                  {lead.deck}
                </p>
                <p className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                  Read it
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </p>
                <p className="mt-6 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  {formatPublished(lead.published)} · {lead.minutes} min read
                </p>
              </Link>
            </Reveal>
          </div>
        </section>
      ) : null}

      <section className="px-5 pb-28 sm:px-8 sm:pb-36">
        <div className="mx-auto max-w-6xl">
          <Reveal
            as="p"
            className="pt-16 text-[0.65rem] font-medium uppercase tracking-[0.18em] text-muted-foreground"
          >
            Everything else
          </Reveal>
          <ul className="mt-8 border-t border-border">
            {rest.map((p, i) => (
              <li key={p.slug} className="border-b border-border">
                <Reveal delay={Math.min(i, 6) * 40}>
                  <Link
                    to="/blog/$slug"
                    params={{ slug: p.slug }}
                    className="group grid gap-4 py-10 sm:grid-cols-[3rem_minmax(0,1fr)_minmax(0,22rem)] sm:gap-10"
                  >
                    <span className="hidden pt-2 font-mono text-xs text-muted-foreground/70 sm:block">
                      {String(i + 2).padStart(2, "0")}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        {formatPublished(p.published)} · {p.minutes} min read
                      </p>
                      <h3 className="mt-3 text-2xl font-semibold tracking-[-0.035em] transition-colors group-hover:text-primary sm:text-4xl">
                        {p.title}
                      </h3>
                    </div>
                    <p className="self-end text-base leading-relaxed text-muted-foreground">
                      {p.deck}
                    </p>
                  </Link>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
