import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Reveal } from "@/components/marketing/Reveal";
import { PriceDriftRibbon } from "@/components/marketing/PriceDriftRibbon";
import { marketingStatsQuery } from "@/lib/marketing.functions";
import { BOOK_DEMO_URL } from "@/lib/marketing-links";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact CostMyAI — a real person, no ticket queue" },
      {
        name: "description",
        content:
          "Questions about AI spend, switching, or the Verification Engine go to mail@costmyai.com. Based in Vienna, Austria.",
      },
      { property: "og:title", content: "Contact CostMyAI" },
      {
        property: "og:description",
        content: "Real question, real person on the other end. mail@costmyai.com, Vienna, Austria.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(marketingStatsQuery()),
  component: ContactPage,
});

function ContactPage() {
  const { data: stats } = useSuspenseQuery(marketingStatsQuery());
  return (
    <MarketingShell>
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 mesh-brand mesh-drift" aria-hidden />
        <PriceDriftRibbon
          moves={stats.priceChangesTracked}
          orientation="diagonal"
          className="absolute inset-x-0 bottom-0 h-[55%] opacity-[0.12] [mask-image:linear-gradient(180deg,transparent,#000_70%)]"
        />
        <div className="absolute inset-0 texture-dots opacity-50" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-5 pb-28 pt-24 sm:px-8 sm:pb-40 sm:pt-32">
          <Reveal className="max-w-4xl">
            <p className="eyebrow">Contact</p>
            <h1 className="mt-5 text-5xl font-semibold leading-[1.03] tracking-[-0.045em] sm:text-7xl">
              Get in <span className="text-gradient-brand-wide">touch</span>.
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
              Real question, real person on the other end. No ticket queue.
            </p>
          </Reveal>

          <Reveal delay={100}>
            <div className="mt-16 divide-y divide-border/60 border-y border-border/60">
              <Row label="Email">
                <a
                  href="mailto:mail@costmyai.com"
                  className="text-3xl font-semibold tracking-[-0.035em] transition-colors hover:text-primary sm:text-5xl"
                >
                  mail@costmyai.com
                </a>
              </Row>
              <Row label="Demo">
                <a
                  href={BOOK_DEMO_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-3xl font-semibold tracking-[-0.035em] transition-colors hover:text-primary sm:text-5xl"
                >
                  Book a Demo
                </a>
              </Row>
              <Row label="Based in">
                <p className="text-3xl font-semibold tracking-[-0.035em] sm:text-5xl">
                  Vienna, Austria
                </p>
              </Row>
            </div>
          </Reveal>
        </div>
      </section>
    </MarketingShell>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-4 py-10 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-baseline sm:gap-10">
      <p className="eyebrow">{label}</p>
      <div>{children}</div>
    </div>
  );
}
