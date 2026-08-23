import { createFileRoute, Link, notFound } from "@tanstack/react-router";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { IntelligenceNoteView } from "@/components/marketing/IntelligenceNote";
import { LABELS, noteBySlug } from "@/lib/intelligence/notes";

/**
 * One note. Public, SSR'd, reads no authenticated data.
 *
 * The provenance label is carried into the meta description as well as the
 * page, so a note cannot be shared in a form that drops the qualifier.
 */
export const Route = createFileRoute("/intelligence/notes/$slug")({
  loader: ({ params }) => {
    const note = noteBySlug(params.slug);
    if (!note) throw notFound();
    return { note };
  },
  head: ({ params, loaderData }) => {
    if (!loaderData?.note) {
      return {
        meta: [{ title: "Note not found | CostMyAI" }, { name: "robots", content: "noindex" }],
      };
    }
    const n = loaderData.note;
    const title = `${n.title} | CostMyAI Intelligence`;
    const description = `${LABELS[n.label].short}. ${n.description}`.slice(0, 300);
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: n.title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { property: "og:url", content: `/intelligence/notes/${params.slug}` },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: `/intelligence/notes/${params.slug}` }],
    };
  },
  notFoundComponent: NoteNotFound,
  component: NotePage,
});

function NoteNotFound() {
  return (
    <MarketingShell>
      <section className="wash-hero px-5 py-32 sm:px-8">
        <div className="mx-auto max-w-3xl">
          <p className="eyebrow">Intelligence note</p>
          <h1 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            No note at that address.
          </h1>
          <p className="mt-6 text-base leading-relaxed text-muted-foreground">
            Notes are published against closed months. The figures themselves are always on the
            Intelligence page.
          </p>
          <Link to="/intelligence" className="btn-gradient mt-8 inline-flex px-6 py-3 text-sm">
            Go to Intelligence
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}

function NotePage() {
  const { note } = Route.useLoaderData();
  return (
    <MarketingShell>
      <IntelligenceNoteView note={note} />
    </MarketingShell>
  );
}
