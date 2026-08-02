import { createFileRoute } from "@tanstack/react-router";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Reveal } from "@/components/marketing/Reveal";
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
  component: ContactPage,
});

function ContactPage() {
  return (
    <MarketingShell>
      <section className="wash-hero px-5 pb-28 pt-24 sm:px-8 sm:pb-40 sm:pt-32">
        <div className="mx-auto max-w-6xl">
          <Reveal className="max-w-4xl">
            <p className="eyebrow">Contact</p>
            <h1 className="mt-5 text-5xl font-semibold leading-[1.03] tracking-[-0.045em] sm:text-7xl">
              Get in <span className="text-gradient-brand">touch</span>.
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
