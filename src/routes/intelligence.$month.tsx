import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Reveal } from "@/components/marketing/Reveal";
import { PriceDriftRibbon } from "@/components/marketing/PriceDriftRibbon";
import {
  IntelligenceReport,
  HeroFigures,
  dateLabel,
  type ReportContext,
} from "@/components/marketing/IntelligenceReport";
import { frozenMonthQuery } from "@/lib/intelligence.functions";

/**
 * The permanent archive page for one closed month.
 *
 * It renders the frozen payload verbatim, never a recomputation, so a link
 * shared today reads identically in a year. Anchors match the live page exactly,
 * which is what lets a per-card share land on the right card here.
 */
export const Route = createFileRoute("/intelligence/$month")({
  loader: async ({ context, params }) => {
    const res = await context.queryClient.ensureQueryData(frozenMonthQuery(params.month));
    if (!res.frozen) throw notFound();
    return res;
  },
  head: ({ params, loaderData }) => {
    if (!loaderData?.frozen) {
      return { meta: [{ title: "Month not archived | CostMyAI" }, { name: "robots", content: "noindex" }] };
    }
    const label = loaderData.frozen.payload.monthLabel;
    const title = `${label} AI price report — frozen figures | CostMyAI`;
    const description = `Frozen ${label} market figures: ${loaderData.frozen.payload.changesTotal} price moves (${loaderData.frozen.payload.increases} up, ${loaderData.frozen.payload.decreases} down) across ${loaderData.frozen.payload.liveModels} models and ${loaderData.frozen.payload.liveHosts} providers. Written once, never edited.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { property: "og:url", content: `/intelligence/${params.month}` },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: `/intelligence/${params.month}` }],
    };
  },
  notFoundComponent: MonthNotFound,
  component: FrozenMonthPage,
});

function MonthNotFound() {
  return (
    <MarketingShell>
      <section className="wash-hero px-5 py-32 sm:px-8">
        <div className="mx-auto max-w-3xl">
          <p className="eyebrow">Archive</p>
          <h1 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            That month has not been frozen.
          </h1>
          <p className="mt-6 text-base leading-relaxed text-muted-foreground">
            Only closed months have a permanent page, and only from the point we began recording
            price history. The open month lives on the Intelligence page.
          </p>
          <Link to="/intelligence" className="btn-gradient mt-8 inline-flex px-6 py-3 text-sm">
            Go to Intelligence
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}

function FrozenMonthPage() {
  const { month } = Route.useParams();
  const { data } = useSuspenseQuery(frozenMonthQuery(month));
  const frozen = data.frozen!;
  const ctx: ReportContext = {
    frozenMonth: frozen.month,
    citableMonth: frozen.month,
    archive: data.archive,
  };

  return (
    <MarketingShell>
      <IntelligenceReport
        data={frozen.payload}
        ctx={ctx}
        hero={
          <section className="relative overflow-hidden border-b border-border">
            <div
              className="pointer-events-none absolute inset-x-0 -top-24 h-[130%] mesh-brand mesh-drift"
              aria-hidden
            />
            <PriceDriftRibbon
              moves={frozen.payload.changesTotal}
              orientation="diagonal"
              className="absolute inset-x-0 bottom-0 h-[55%] opacity-[0.12] [mask-image:linear-gradient(180deg,transparent,#000_70%)]"
            />
            <div className="absolute inset-0 texture-dots opacity-50" aria-hidden />
            <div className="relative mx-auto max-w-6xl px-5 pb-20 pt-24 sm:px-8 sm:pb-24 sm:pt-36">
              <Reveal className="max-w-4xl">
                <p className="eyebrow">Archive · {frozen.month}</p>
                <h1 className="mt-5 text-5xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-7xl">
                  {frozen.payload.monthLabel},
                  <br />
                  <span className="text-gradient-brand-wide">frozen</span>.
                </h1>
                <p className="mt-7 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
                  These figures were written once, at month close on{" "}
                  {dateLabel(frozen.frozenAt)}, and cannot be edited. Cite them freely: this page
                  will read the same in a year.
                  {frozen.restated
                    ? " This is a restatement, filed as a new row that references the original."
                    : ""}
                </p>
                <p className="mt-5 max-w-2xl text-sm leading-relaxed text-muted-foreground/90">
                  What this is: a public monthly record of what AI model prices actually did, which
                  providers moved them, and which model is still the cheapest one good enough for a
                  given job.
                </p>
                {frozen.note ? (
                  <p className="mt-4 max-w-2xl text-sm text-muted-foreground/80">{frozen.note}</p>
                ) : null}
              </Reveal>
              <HeroFigures data={frozen.payload} ctx={ctx} />
            </div>
          </section>
        }
      />
    </MarketingShell>
  );
}
