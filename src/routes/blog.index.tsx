import { createFileRoute, Link } from "@tanstack/react-router";

import { Reveal } from "@/components/marketing/Reveal";
import { formatPublished, postsNewestFirst } from "@/lib/blog/posts";

/**
 * Blog index. Same restraint as the Intelligence page: a hairline rail of
 * headlines, no cards, the title itself doing the work.
 */
export const Route = createFileRoute("/blog/")({
  head: () => ({
    meta: [
      { title: "Blog — AI cost governance, measured | CostMyAI" },
      {
        name: "description",
        content:
          "Writing on FinOps for AI, shadow AI spend, token pricing, agent cost and benchmark-backed model switching. Measured, not estimated.",
      },
      { property: "og:title", content: "The CostMyAI blog" },
      {
        property: "og:description",
        content:
          "How AI spend is actually measured, where model-equivalence claims fall apart, and which switches are provably safe.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://www.costmyai.com/blog" }],
  }),
  component: BlogIndex,
});

function BlogIndex() {
  const posts = postsNewestFirst();

  return (
    <div className="flex flex-col">
      <section className="wash-hero px-5 pb-16 pt-24 sm:px-8 sm:pb-20 sm:pt-32">
        <div className="mx-auto max-w-6xl">
          <Reveal className="max-w-4xl">
            <p className="eyebrow">Blog</p>
            <h1 className="mt-5 text-5xl font-semibold leading-[1.03] tracking-[-0.045em] sm:text-7xl">
              AI spend, <span className="text-gradient-brand">measured</span>.
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
              Field notes on Financial Governance for AI: what actually drives the bill, which
              savings are real, and which switches can be proven safe before you make them.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="px-5 pb-28 sm:px-8 sm:pb-36">
        <div className="mx-auto max-w-6xl">
          <ul className="divide-y divide-border/60 border-t border-border/60">
            {posts.map((p, i) => (
              <li key={p.slug}>
                <Reveal delay={Math.min(i, 6) * 40}>
                  <Link
                    to="/blog/$slug"
                    params={{ slug: p.slug }}
                    className="group grid gap-4 py-10 sm:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] sm:gap-12"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        {formatPublished(p.published)} · {p.minutes} min read
                      </p>
                      <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] transition-colors group-hover:text-primary sm:text-4xl">
                        {p.title}
                      </h2>
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
