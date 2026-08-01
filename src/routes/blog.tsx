import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, PenLine } from "lucide-react";

import { MarketingShell } from "@/components/marketing/MarketingShell";

/**
 * Blog — a real route with nothing published yet.
 *
 * We say that plainly rather than staging invented posts: the same honesty the
 * product applies to a refusal applies to an empty content shelf.
 */
export const Route = createFileRoute("/blog")({
  head: () => ({
    meta: [
      { title: "Blog — CostMyAI" },
      {
        name: "description",
        content:
          "Writing on AI cost measurement, model equivalence and the switches worth making — the CostMyAI blog opens shortly.",
      },
      { property: "og:title", content: "Blog — CostMyAI" },
      {
        property: "og:description",
        content: "Notes on measuring AI spend honestly. First pieces publishing soon.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BlogPage,
});

function BlogPage() {
  return (
    <MarketingShell>
      <section className="mx-auto max-w-3xl px-6 py-24 text-center sm:py-32">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <PenLine className="size-3.5" />
          Coming soon
        </span>
        <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">
          Nothing published here yet.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
          The blog will cover how AI spend is actually measured, where model-equivalence claims fall
          apart, and what we learn from real switches on real traffic. We would rather leave this
          page empty than fill it with posts we have not written.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/intelligence"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Read how we measure
            <ArrowRight className="size-4" />
          </Link>
          <Link
            to="/demo/overview"
            className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-muted"
          >
            See the live demo
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}
