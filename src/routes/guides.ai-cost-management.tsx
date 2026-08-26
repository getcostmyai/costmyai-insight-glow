import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Reveal } from "@/components/marketing/Reveal";
import { PriceDriftRibbon } from "@/components/marketing/PriceDriftRibbon";
import { marketingStatsQuery } from "@/lib/marketing.functions";

const URL = "https://www.costmyai.com/guides/ai-cost-management";
const TITLE = "AI cost management: a practical guide for teams | CostMyAI";
const DESCRIPTION =
  "How AI cost management actually works: what drives an LLM bill, the five steps from visibility to certified switching, and how to keep spend falling without losing output quality.";

/**
 * Evergreen entry page for the plain-language search term ("ai cost
 * management"). Deliberately a guide route rather than a blog post: the intent
 * behind the phrase is definitional and repeat-visited, so it must not carry a
 * publication date that ages, and it must be linkable from navigation forever.
 */
export const Route = createFileRoute("/guides/ai-cost-management")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: "AI cost management: a practical guide for teams" },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "article" },
      { property: "og:url", content: URL },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(marketingStatsQuery()),
  component: AiCostManagementGuide;
});

const FAQS = [
  {
    q: "What is AI cost management?",
    a: "AI cost management is the practice of measuring what every AI workload costs, attributing that cost to the team or feature that caused it, and then reducing it without degrading output quality. It differs from ordinary cloud cost management because the unit of spend is a token, the price of that token changes without notice, and two providers can serve identical model weights at very different rates.",
  },
  {
    q: "Why does an AI bill rise while token prices fall?",
    a: "Volume and verbosity grow faster than published rates fall. More features call a model, prompts get longer, retries and reasoning tokens accumulate, and output length drifts upward. A falling per-token price applied to a rising token count still produces a larger invoice.",
  },
  {
    q: "What is the cheapest way to cut AI spend without a quality risk?",
    a: "Move the same model to the cheapest verified host serving it. The weights are identical, so output does not change, and there is nothing to re-evaluate. Only after that is exhausted does swapping to a different model become worth the evaluation cost.",
  },
  {
    q: "Do AI cost tools need your provider API keys?",
    a: "No, and they should not have them. Cost analysis needs usage and price records, not the ability to make calls on your behalf. CostMyAI never holds your provider keys.",
  },
];

function faqJsonLd() {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  });
}

function AiCostManagementGuide() {
  const { data: stats } = useSuspenseQuery(marketingStatsQuery());
  return (
    <MarketingShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqJsonLd() }} />

      <div className="flex flex-col">
        <Hero moves={stats.priceChangesTracked} />
        <Drivers />
        <Steps />
        <Numbers
          models={stats.modelCount}
          providers={stats.providerCount}
          moves={stats.priceChangesTracked}
        />
        <Faq />
        <Cta moves={stats.priceChangesTracked} />
      </div>
    </MarketingShell>
  );
}

function Hero({ moves }: { moves: number }) {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div
        className="pointer-events-none absolute inset-x-0 -top-24 h-[130%] mesh-brand mesh-drift"
        aria-hidden
      />
      <PriceDriftRibbon
        moves={moves}
        orientation="diagonal"
        className="absolute inset-x-0 bottom-0 h-[55%] opacity-[0.12] [mask-image:linear-gradient(180deg,transparent,#000_70%)]"
      />
      <div className="absolute inset-0 texture-dots opacity-50" aria-hidden />

      <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-24 sm:px-8 sm:pb-20 sm:pt-32">
        <Reveal className="max-w-4xl">
          <p className="eyebrow">Guide</p>
          <h1 className="mt-5 text-[2.7rem] font-semibold leading-[1.03] tracking-[-0.045em] sm:text-7xl">
            AI cost management,
            <br />
            <span className="text-gradient-brand-wide">without guessing</span>.
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
            Most teams discover their AI spend the same way: an invoice arrives, nobody can say
            which feature caused it, and the only lever anyone trusts is using the model less. This
            guide sets out what actually drives the bill and the order in which to attack it.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link to="/tools/llm-price-comparison" className="btn-gradient px-6 py-3 text-[15px]">
              Price your own volume
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/how-it-works" className="btn-quiet px-6 py-3 text-[15px]">
              See how CostMyAI works
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

const DRIVERS = [
  {
    title: "Volume you cannot attribute",
    body: "A provider invoice is one number for an entire company. Without per-workload attribution, nobody can say whether support summaries or the internal coding assistant caused the increase, so nobody owns the fix.",
  },
  {
    title: "Output length, not input length",
    body: "Output tokens usually cost several times more than input tokens. A prompt change that makes answers longer raises the bill more than the same change applied to context.",
  },
  {
    title: "The wrong host for the right model",
    body: "Identical open-weight models are served by multiple providers at different rates. Paying the dearest host for the same weights is pure waste, and it is invisible on an invoice.",
  },
  {
    title: "Prices that move under you",
    body: "Published rates change without announcements. A route that was cheapest last quarter may not be cheapest today, and nothing tells you when it stopped being true.",
  },
  {
    title: "Retries, reasoning and cache misses",
    body: "Failed calls, reasoning tokens and lost prompt-cache hits are all billed. They rarely appear in a cost model built from a pricing page.",
  },
];

function Drivers() {
  return (
    <section className="border-b border-border px-5 py-20 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-3xl">
        <Reveal as="h2" className="text-[1.8rem] font-semibold tracking-[-0.035em] sm:text-[2.6rem]">
          What actually drives an AI bill
        </Reveal>
        <div className="mt-12 divide-y divide-border border-y border-border">
          {DRIVERS.map((d, i) => (
            <Reveal key={d.title} delay={60 * i} className="flex gap-6 py-7">
              <span className="num shrink-0 text-sm text-muted-foreground">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="text-lg font-semibold tracking-[-0.02em]">{d.title}</h3>
                <p className="mt-2 text-base leading-relaxed text-muted-foreground">{d.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  {
    label: "Step 1",
    title: "Get the spend visible per workload",
    body: "Break the invoice into the jobs that produced it. Until a cost has an owner and a purpose, every reduction argument is a matter of opinion.",
  },
  {
    label: "Step 2",
    title: "Reprice the same work at every host",
    body: "For each workload, compute what the identical calls would have cost at every provider serving that model. This is the only saving with no quality question attached.",
  },
  {
    label: "Step 3",
    title: "Prove quality before changing a model",
    body: "Where a different model is genuinely cheaper, it has to pass your own task before it earns the traffic. A cheaper model that needs a retry or writes three times as much is not cheaper.",
  },
  {
    label: "Step 4",
    title: "Right-size the model to the task",
    body: "Most workloads are running on a model larger than the job needs. Match the tier to the difficulty of the task rather than to the most capable model available.",
  },
  {
    label: "Step 5",
    title: "Keep watching, because prices move",
    body: "Cost management is not a project with an end date. Rates change, new hosts appear, and traffic shifts. Whatever you decide today needs re-checking against the next price move.",
  },
];

function Steps() {
  return (
    <section className="wash-brand border-b border-border px-5 py-20 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-3xl">
        <Reveal as="h2" className="text-[1.8rem] font-semibold tracking-[-0.035em] sm:text-[2.6rem]">
          The five steps, in the order that pays
        </Reveal>
        <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground">
          The sequence matters more than the tooling. Teams that start at step three spend weeks
          evaluating models while the same-model waste from step two sits untouched.
        </p>
        <div className="mt-12 space-y-10">
          {STEPS.map((s, i) => (
            <Reveal key={s.title} delay={60 * i} className="border-t border-border pt-7">
              <p className="text-[0.7rem] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                {s.label}
              </p>
              <h3 className="mt-3 text-xl font-semibold tracking-[-0.025em] sm:text-2xl">
                {s.title}
              </h3>
              <p className="mt-3 text-base leading-relaxed text-muted-foreground">{s.body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Numbers({
  models,
  providers,
  moves,
}: {
  models: number;
  providers: number;
  moves: number;
}) {
  return (
    <section className="border-b border-border px-5 py-20 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal as="h2" className="text-[1.8rem] font-semibold tracking-[-0.035em] sm:text-[2.4rem]">
          What we track so you do not have to
        </Reveal>
        <div className="mt-12 grid gap-10 border-y border-border py-10 sm:grid-cols-3">
          <Stat label="Models priced" value={models.toLocaleString()} />
          <Stat label="Providers with verified live prices" value={providers.toLocaleString()} />
          <Stat label="Price moves caught this month" value={moves.toLocaleString()} accent />
        </div>
        <p className="mt-8 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Every rate is a published list price we hold a verified record for. Sourcing rules are in
          the{" "}
          <Link to="/legal/methodology" className="text-primary underline-offset-4 hover:underline">
            methodology
          </Link>
          , the full catalog is in{" "}
          <Link to="/models" className="text-primary underline-offset-4 hover:underline">
            Models
          </Link>
          , and monthly price movement is published in{" "}
          <Link to="/intelligence" className="text-primary underline-offset-4 hover:underline">
            Intelligence
          </Link>
          .
        </p>
      </div>
    </section>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p
        className={`num text-[2.4rem] font-semibold leading-none tracking-[-0.045em] ${
          accent ? "text-gradient-brand" : "text-foreground"
        }`}
      >
        {value}
      </p>
      <p className="mt-3 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function Faq() {
  return (
    <section className="border-b border-border px-5 py-20 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-3xl">
        <Reveal as="h2" className="text-[1.8rem] font-semibold tracking-[-0.035em] sm:text-[2.6rem]">
          Common questions
        </Reveal>
        <div className="mt-12 divide-y divide-border border-y border-border">
          {FAQS.map((f, i) => (
            <Reveal key={f.q} delay={60 * i} className="py-7">
              <h3 className="text-lg font-semibold tracking-[-0.02em]">{f.q}</h3>
              <p className="mt-3 text-base leading-relaxed text-muted-foreground">{f.a}</p>
            </Reveal>
          ))}
        </div>
        <p className="mt-8 text-sm text-muted-foreground">
          More answers in the{" "}
          <Link to="/faq" className="text-primary underline-offset-4 hover:underline">
            full FAQ
          </Link>
          .
        </p>
      </div>
    </section>
  );
}

function Cta({ moves }: { moves: number }) {
  return (
    <section className="relative overflow-hidden px-5 py-24 sm:px-8 sm:py-32">
      <div className="pointer-events-none absolute inset-0 mesh-brand mesh-drift" aria-hidden />
      <PriceDriftRibbon
        moves={moves}
        className="absolute inset-x-0 bottom-0 h-[26%] opacity-25 [mask-image:linear-gradient(180deg,transparent_0%,transparent_70%,#000_100%)]"
      />
      <Reveal className="relative mx-auto max-w-3xl text-center">
        <h2 className="text-[2rem] font-semibold leading-[1.05] tracking-[-0.04em] sm:text-[3.2rem]">
          Start with step two.{" "}
          <span className="text-gradient-brand-wide">It costs nothing.</span>
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          Compare reads your real usage and names the cheaper route for every workload, with no
          model change and no key handover. Free, forever.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link to="/auth" className="btn-gradient px-6 py-3 text-[15px]">
            Start Compare, free
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link to="/tools/llm-price-comparison" className="btn-quiet px-6 py-3 text-[15px]">
            LLM price comparison
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
