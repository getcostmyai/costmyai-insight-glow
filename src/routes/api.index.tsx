import { createFileRoute, Link } from "@tanstack/react-router";
import { Mail } from "lucide-react";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Reveal } from "@/components/marketing/Reveal";

export const Route = createFileRoute("/api/")({
  head: () => ({
    meta: [
      { title: "API — how CostMyAI connects to your data | CostMyAI" },
      {
        name: "description",
        content:
          "CostMyAI does not hold your provider credentials. The Verification Engine runs in your environment and pushes neutral, aggregate usage and spend records to CostMyAI.",
      },
      {
        property: "og:title",
        content: "API — how CostMyAI connects to your data",
      },
      {
        property: "og:description",
        content:
          "The Verification Engine runs in your environment, reads your usage with your own keys, and sends aggregate metadata to CostMyAI. No prompts, no completions, no credentials.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/api" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "/api" }],
  }),
  component: ApiPage,
});

const WHAT_IT_SENDS = [
  "Aggregate, provider-neutral usage records",
  "Billed spend, per model and per host",
  "Token counts, latency, and status metadata",
];

const WHAT_IT_DOES_NOT = [
  "Prompts or completions",
  "Provider API keys",
  "Any customer content",
  "A way to pull your dashboard data back out programmatically",
];

function ApiPage() {
  return (
    <MarketingShell>
      <div className="flex flex-col">
        <section className="wash-hero px-5 pb-16 pt-24 sm:px-8 sm:pb-20 sm:pt-32">
          <div className="mx-auto max-w-6xl">
            <Reveal className="max-w-4xl">
              <p className="eyebrow">API</p>
              <h1 className="mt-5 text-5xl font-semibold leading-[1.03] tracking-[-0.045em] sm:text-7xl">
                Not a REST API you query for your own dashboard data,{" "}
                <span className="text-gradient-brand">not yet</span>.
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
                This page describes how CostMyAI actually connects to your AI usage today, and what
                comes next. The real integration surface is ingestion, built so visibility into your
                spend never requires handing a third party your credentials.
              </p>
            </Reveal>
          </div>
        </section>

        <section className="px-5 pb-28 sm:px-8 sm:pb-36">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-16 sm:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] sm:gap-24">
              <Reveal>
                <div className="border-t border-border/60 pt-10">
                  <h2 className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
                    How CostMyAI connects to your data today
                  </h2>
                  <p className="mt-6 text-[1.0625rem] leading-[1.75] text-muted-foreground">
                    The Verification Engine is the component that makes CostMyAI work without ever
                    holding your provider credentials. It runs inside your own environment, reads
                    your real AI usage and billing data using your own provider keys, which never
                    leave that environment, and pushes neutral, aggregate records to CostMyAI over
                    its own API.
                  </p>
                  <p className="mt-4 text-[1.0625rem] leading-[1.75] text-muted-foreground">
                    This is the actual integration surface today: an ingestion path, built
                    specifically so visibility into your AI spend never requires handing a third
                    party your credentials.
                  </p>
                  <div className="mt-8">
                    <Link
                      to="/"
                      hash="architecture"
                      className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-muted"
                    >
                      Verification Engine setup guide
                    </Link>
                  </div>
                </div>
              </Reveal>

              <Reveal delay={80}>
                <div className="space-y-10">
                  <div className="border-t border-border/60 pt-10">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      What it sends
                    </h3>
                    <ul className="mt-5 space-y-4">
                      {WHAT_IT_SENDS.map((item) => (
                        <li
                          key={item}
                          className="flex items-start gap-3 text-[1.0625rem] leading-relaxed text-foreground"
                        >
                          <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="border-t border-border/60 pt-10">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      What it does not do yet
                    </h3>
                    <ul className="mt-5 space-y-4">
                      {WHAT_IT_DOES_NOT.map((item) => (
                        <li
                          key={item}
                          className="flex items-start gap-3 text-[1.0625rem] leading-relaxed text-foreground"
                        >
                          <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                          {item}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
                      Every number you see in CostMyAI today lives in the dashboard UI. There is no
                      programmatic customer data export yet.
                    </p>
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        <section className="border-t border-border/60 px-5 py-24 sm:px-8 sm:py-32">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-12 sm:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] sm:gap-24">
              <Reveal>
                <h2 className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
                  What comes next
                </h2>
              </Reveal>
              <Reveal delay={80}>
                <p className="text-[1.0625rem] leading-[1.75] text-muted-foreground">
                  The strongest case for a public query API is consistency with what CostMyAI already
                  argues for: a platform built against vendor lock-in should not itself lock a
                  customer&apos;s own spend and savings data behind a UI with no way out. A read API
                  letting customers pull their own certified switches, savings, and spend history
                  into their own BI tools or alerting systems is the clearest, most likely next
                  step.
                </p>
                <p className="mt-6 text-[1.0625rem] leading-[1.75] text-muted-foreground">
                  This is not built yet, and it will get built the moment real demand shows it is
                  worth building, not before. If you have a specific integration need today, tell us
                  what you are trying to connect, and what breaks for you without it. That is the
                  single most useful thing you can send us right now.
                </p>
              </Reveal>
            </div>
          </div>
        </section>

        <section className="border-t border-border/60 px-5 py-24 sm:px-8 sm:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <Reveal>
              <h2 className="text-3xl font-semibold tracking-[-0.035em] sm:text-5xl">
                Tell us what you&apos;re trying to{" "}
                <span className="text-gradient-brand">connect</span>.
              </h2>
              <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
                <a
                  href="mailto:mail@costmyai.com"
                  className="btn-gradient inline-flex items-center gap-2 px-6 py-3 text-sm"
                >
                  <Mail className="h-4 w-4" />
                  mail@costmyai.com
                </a>
              </div>
            </Reveal>
          </div>
        </section>
      </div>
    </MarketingShell>
  );
}
