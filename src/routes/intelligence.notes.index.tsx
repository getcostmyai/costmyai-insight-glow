import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Reveal } from "@/components/marketing/Reveal";
import { PriceDriftRibbon } from "@/components/marketing/PriceDriftRibbon";
import { LabelChip } from "@/components/marketing/IntelligenceNote";
import { formatNoteDate, notesNewestFirst, type Note } from "@/lib/intelligence/notes";

/**
 * The notes index.
 *
 * While the corpus is empty the page is deliberately noindex and unlinked: an
 * empty section that promises analysis is exactly the kind of copy Dispatch 119
 * removed everywhere else. It flips to indexable the moment a note exists.
 */
export const Route = createFileRoute("/intelligence/notes/")({
  loader: () => ({ notes: notesNewestFirst() }),
  head: ({ loaderData }) => {
    const empty = (loaderData?.notes.length ?? 0) === 0;
    const title = "Intelligence notes | CostMyAI";
    const description =
      "Why the numbers moved: labelled analysis of AI pricing, each note marked as proven mechanism, correlation, or third-party sourced.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: "Intelligence notes" },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        ...(empty ? [{ name: "robots", content: "noindex" }] : []),
      ],
      links: [{ rel: "canonical", href: "/intelligence/notes" }],
    };
  },
  component: NotesIndex,
});

function NotesIndex() {
  const { notes } = Route.useLoaderData() as { notes: Note[] };

  return (
    <MarketingShell>
      <section className="relative overflow-hidden border-b border-border">
        <div
          className="pointer-events-none absolute inset-x-0 -top-24 h-[130%] mesh-brand mesh-drift"
          aria-hidden
        />
        <PriceDriftRibbon
          moves={notes.length * 7 + 40}
          orientation="diagonal"
          className="absolute inset-x-0 bottom-0 h-[55%] opacity-[0.12] [mask-image:linear-gradient(180deg,transparent,#000_70%)]"
        />
        <div className="absolute inset-0 texture-dots opacity-50" aria-hidden />
        <div className="relative mx-auto max-w-5xl px-5 pb-16 pt-24 sm:px-8 sm:pb-20 sm:pt-32">
          <Reveal>
            <p className="eyebrow">Intelligence</p>
            <h1 className="mt-5 max-w-4xl text-4xl font-semibold leading-[1.05] tracking-[-0.045em] sm:text-7xl">
              The figures are the commodity.
              <br />
              <span className="text-gradient-brand-wide">The reading is the work.</span>
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Every note carries a provenance label before its first sentence: a proven mechanism,
              a correlation we will not call a cause, or somebody else's data we have named. That
              label is enforced by test, not by editorial habit.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="wash-brand px-5 pb-24 pt-16 sm:px-8 sm:pb-32 sm:pt-20">
        <div className="mx-auto max-w-5xl">
          {notes.length === 0 ? (
            <Reveal>
              <div className="border-t border-border/60 pt-10">
                <p className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  No notes published yet.
                </p>
                <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
                  The first note is written against a closed month, so it lands with the freeze
                  rather than ahead of it. Until then there is nothing here to read, and we would
                  rather say that than pad the page.
                </p>
                <Link
                  to="/intelligence"
                  className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
                >
                  See the current figures
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            </Reveal>
          ) : (
            <ul className="divide-y divide-border/60 border-t border-border/60">
              {notes.map((n) => (
                <li key={n.slug}>
                  <Reveal>
                    <Link
                      to="/intelligence/notes/$slug"
                      params={{ slug: n.slug }}
                      className="group grid gap-5 py-10 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-10"
                    >
                      <div className="flex flex-col gap-3">
                        <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                          {formatNoteDate(n.published)}
                        </span>
                        <LabelChip label={n.label} />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-2xl font-semibold tracking-[-0.03em] transition-colors group-hover:text-primary sm:text-3xl">
                          {n.title}
                        </h2>
                        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
                          {n.deck}
                        </p>
                        <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                          Read the note
                          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                        </span>
                      </div>
                    </Link>
                  </Reveal>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </MarketingShell>
  );
}
