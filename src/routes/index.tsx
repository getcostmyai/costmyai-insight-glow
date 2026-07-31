import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  Layers,
  PlayCircle,
  Rocket,
  ShieldCheck,
  User,
  Users,
} from "lucide-react";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { ArchitectureDiagram } from "@/components/marketing/ArchitectureDiagram";
import { Estimator } from "@/components/marketing/Estimator";
import { ProviderMarquee } from "@/components/marketing/ProviderMarquee";
import { BOOK_DEMO_URL } from "@/lib/marketing-links";
import { marketingStatsQuery, type MarketingStats } from "@/lib/marketing.functions";
import { PLAN_META } from "@/lib/engine/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CostMyAI — stop overpaying for AI" },
      {
        name: "description",
        content:
          "CostMyAI reads only metadata from your stack, proves where the same quality costs less, and switches it — manually, or automatically on Govern. No provider keys, no prompt content.",
      },
      { property: "og:title", content: "CostMyAI — stop overpaying for AI" },
      {
        property: "og:description",
        content:
          "Certified, benchmark-backed model and host switches. Metadata only, independent benchmarks, and an honest refusal whenever a saving cannot be proven.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(marketingStatsQuery()),
  component: HomePage,
});

function HomePage() {
  const { data: stats } = useSuspenseQuery(marketingStatsQuery());

  return (
    <MarketingShell>
      <Hero stats={stats} />
      <ProviderMarquee stats={stats} />

      <Estimator />
      <VideoSection />
      <Architecture />
      <HowItWorks />
      <BuiltFor />
      <Pricing stats={stats} />
      <Neutrality />
      <Faq stats={stats} />
      <ClosingCta />
    </MarketingShell>
  );
}

/* ------------------------------- 01 · hero ------------------------------- */

function Hero({ stats }: { stats: MarketingStats }) {
  return (
    <section className="relative overflow-hidden wash-hero">
      <div className="absolute inset-0 texture-dots opacity-60" aria-hidden />
      <div className="relative mx-auto max-w-3xl px-5 pb-24 pt-24 text-center sm:px-8 sm:pb-28 sm:pt-32">
        <h1 className="mt-6 text-[2.9rem] font-bold leading-[1.02] tracking-[-0.035em] sm:text-[4.2rem]">
          Stop overpaying <span className="text-gradient-brand">for AI.</span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          Same model on a cheaper host. A different model that benchmarks the same. A frontier model
          doing work a small one does identically. CostMyAI finds all three from your gateway
          metadata, proves each one before it moves anything — then switches it manually or lets
          Govern do it automatically.
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <a href="#estimator" className="btn-gradient px-6 py-3 text-[15px]">
            See if you are overpaying
            <ArrowRight className="h-4 w-4" />
          </a>
          <a
            href={BOOK_DEMO_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="btn-quiet px-6 py-3 text-[15px]"
          >
            Book a Demo
          </a>
        </div>

        <p className="mt-5 text-sm text-muted-foreground">
          Metadata only. Never your prompt content.
        </p>
      </div>
    </section>
  );
}




/* ------------------------------- 04 · video ------------------------------ */

function VideoSection() {
  return (
    <section className="border-y border-border bg-card">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
        <SectionHead
          eyebrow="See It Working"
          title="From live usage to a governed decision in under 60 seconds."
          lead="Watch the Verification Engine read real usage, benchmark every workload, and produce a defensible verdict."
        />
        <div className="mx-auto mt-12 max-w-4xl">
          <div className="relative grid aspect-video place-items-center overflow-hidden rounded-[1.75rem] border border-border bg-background">
            <div className="absolute inset-0 opacity-[0.07] fill-gradient-brand" aria-hidden />
            <div className="relative text-center">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-secondary">
                <PlayCircle className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="mt-4 text-sm font-medium text-muted-foreground">
                Product demo coming soon
              </p>
              <a
                href={BOOK_DEMO_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="btn-quiet mt-6 px-5 py-2.5 text-sm"
              >
                Get a walkthrough live instead
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* --------------------------- 05 · architecture --------------------------- */

function Architecture() {
  return (
    <section id="architecture" className="scroll-mt-24 wash-section">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
        <SectionHead
          eyebrow="Architecture"
          title="Runs in your environment. Sees only metadata."
          lead="The Verification Engine is middleware. Your application routes every AI request through it. The engine forwards the request unchanged, reads only token counts and model names, then sends aggregate metadata to CostMyAI. It never reads prompt content."
        />
        <div className="mt-12">
          <ArchitectureDiagram />
        </div>
      </div>
    </section>
  );
}

/* --------------------------- 06 · how it works --------------------------- */

const STEPS = [
  {
    n: "01",
    title: "Connect",
    body: "Point your application at the Verification Engine endpoint. One environment variable change. Requests forward to your provider unchanged. The engine reads token counts, model names, and request counts. Never your prompt content.",
  },
  {
    n: "02",
    title: "Map",
    body: "We read your real spend, group it by workload, and benchmark every model against the live catalog — which re-syncs continuously, so a verdict is always measured against today's prices, not last quarter's. The buy-side view, not the vendor's.",
  },
  {
    n: "03",
    title: "Verdict",
    body: "See which switches hold quality on real benchmarks, and which ones we refuse to certify. A governed decision names what it cannot prove.",
  },
  {
    n: "04",
    title: "Switch",
    body: "Switch the workloads that hold quality. Keep the savings. Leave the rest exactly where they are. Not paying more than you need to, on the record and defensible.",
  },
];

function HowItWorks() {
  const [open, setOpen] = useState(0);
  return (
    <section id="how" className="scroll-mt-24 border-y border-border bg-card">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
        <SectionHead
          eyebrow="How It Works"
          title="Connect once. Governed decisions on every workload."
          lead="Four steps. No manual exports. A defensible, benchmark-backed verdict for every workload in your live spend."
        />

        <div className="mx-auto mt-12 max-w-3xl divide-y divide-border overflow-hidden rounded-[1.5rem] border border-border bg-background">
          {STEPS.map((s, i) => {
            const isOpen = open === i;
            return (
              <div key={s.n}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? -1 : i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-4 px-6 py-5 text-left"
                >
                  <span className="num text-sm text-primary">{s.n}</span>
                  <span className="flex-1 text-lg font-semibold tracking-tight">{s.title}</span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {isOpen ? (
                  <p className="px-6 pb-6 pl-[3.6rem] text-sm leading-relaxed text-muted-foreground">
                    {s.body}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- 07 · built for ---------------------------- */

const PERSONAS = [
  {
    icon: User,
    title: "Solo founder",
    pain: "Your first real AI invoice arrived and it was scary.",
  },
  {
    icon: Users,
    title: "Small team",
    pain: "Nobody here owns finance, so nobody owns the AI line item.",
  },
  {
    icon: Layers,
    title: "Agency",
    pain: "You carry client AI spend and have to justify every dollar of it.",
  },
  {
    icon: Rocket,
    title: "Scale-up",
    pain: "AI is now a top-three cost and the board has started asking.",
  },
  {
    icon: Building2,
    title: "Enterprise",
    pain: "Every team picks its own model and no one standard governs any of it.",
  },
];

function BuiltFor() {
  return (
    <section className="wash-section">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
        <SectionHead
          eyebrow="Built For"
          title="Built for whoever is accountable for the AI spend."
          lead="From solo founders watching their first AI invoice to enterprise teams standardizing governance across every model deployment."
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PERSONAS.map((p) => (
            <div key={p.title} className="card-surface flex flex-col p-6">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary-soft">
                <p.icon className="h-5 w-5 text-primary" />
              </div>
              <p className="mt-4 text-lg font-semibold tracking-tight">{p.title}</p>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{p.pain}</p>
              <a
                href={BOOK_DEMO_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary"
              >
                Book a Demo
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ 08 · pricing ----------------------------- */

const PLAN_FEATURES: Record<string, string[]> = {
  compare: [
    "Same model, cheaper host — on your own traffic",
    "Live price catalog across every tracked provider",
    "Metadata-only ingest, no provider keys",
    "Unlimited workloads, free forever",
  ],
  certify: [
    "Everything in Compare",
    "Quality-matched cheaper models, benchmark-backed",
    "Measured equivalence margin on every claim",
    "Named refusals when nothing can be proven",
  ],
  rightsize: [
    "Everything in Certify",
    "Oversized-workload detection per task class",
    "Manual switching with one-click rollback",
    "Objectives: cost, latency ceiling, quality floor",
  ],
  govern: [
    "Everything in Rightsize",
    "Autonomous switching inside the equivalence band",
    "Full audit trail on every automated decision",
    "Billing reconciliation against your own invoices",
  ],
};

const RUNGS = ["compare", "certify", "rightsize", "govern"] as const;

function Pricing({ stats }: { stats: MarketingStats }) {
  const [yearly, setYearly] = useState(true);

  return (
    <section id="pricing" className="scroll-mt-24 border-y border-border bg-card">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
        <SectionHead
          eyebrow="Pricing"
          title="Start free. Scale when you need to."
          lead={`Pricing covers ${stats.modelCount} models across ${stats.providerCount} providers.`}
        />

        <div className="mt-8 flex justify-center">
          <div className="inline-flex rounded-full border border-border bg-background p-1">
            {[
              { id: true, label: "Annual" },
              { id: false, label: "Monthly" },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                onClick={() => setYearly(o.id)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  yearly === o.id ? "fill-gradient-brand text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {RUNGS.map((plan) => {
            const meta = PLAN_META[plan];
            const price = yearly ? meta.yearly : meta.monthly;
            const featured = plan === "rightsize";
            return (
              <div
                key={plan}
                className={`flex flex-col rounded-3xl border p-6 ${
                  featured
                    ? "border-primary/40 bg-primary-soft shadow-[var(--shadow-card)]"
                    : "border-border bg-background shadow-[var(--shadow-card)]"
                }`}
              >
                <p className="text-sm font-semibold tracking-tight">{meta.label}</p>
                <p className="num mt-4 text-3xl">
                  {price === 0 ? "Free" : `$${price}`}
                  {price === 0 ? null : (
                    <span className="text-sm font-medium text-muted-foreground"> /mo</span>
                  )}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {price === 0 ? "No card, ever" : yearly ? "billed annually" : "billed monthly"}
                </p>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{meta.blurb}</p>

                <ul className="mt-5 flex-1 space-y-2.5">
                  {PLAN_FEATURES[plan].map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-saving" />
                      <span className="text-sm leading-snug text-muted-foreground">{f}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  to="/auth"
                  className={`mt-6 ${featured ? "btn-gradient" : "btn-quiet"} w-full px-5 py-2.5 text-sm`}
                >
                  {plan === "compare" ? "Start free" : `Get ${meta.label}`}
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------- 09 · neutrality ---------------------------- */

const CHARTER = [
  {
    title: "No vendor affiliation",
    body: "No provider pays for placement, ranking, or inclusion. There is no ad slot to buy here.",
  },
  {
    title: "Buy-side only",
    body: "We are paid by you and only by you. A cost advisor with a revenue share from the destination is a sales channel in a lab coat.",
  },
  {
    title: "Independent benchmarks",
    body: "Quality claims rest on third-party evaluations we do not run, with the measurement margin published alongside the score.",
  },
  {
    title: "Refusal is a feature",
    body: "When nothing clears the bar you get the refusal and its reason — not a weaker suggestion dressed up as a saving.",
  },
];

function Neutrality() {
  return (
    <section id="neutrality" className="scroll-mt-24 px-5 py-14 sm:px-8">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] fill-gradient-brand px-8 py-20 text-primary-foreground sm:px-14">
        <div className="absolute inset-0 texture-dots opacity-20" aria-hidden />
        <div className="relative">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-80">
              Neutrality Charter
            </p>
            <h2 className="mt-4 text-3xl font-bold leading-tight tracking-[-0.028em] sm:text-[2.6rem]">
              We don't work for OpenAI, Anthropic, or anyone else who sells you tokens. We work for
              your P&amp;L.
            </h2>
            <p className="mt-5 text-[15px] leading-relaxed opacity-90">
              Nobody is buying products or features — they all buy a better P&amp;L.
            </p>
            <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed opacity-80">
              Financial Governance requires independence. We have no provider affiliations, no
              sponsored placements, and no incentive to recommend any specific model.
            </p>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CHARTER.map((c) => (
              <div
                key={c.title}
                className="rounded-2xl border border-primary-foreground/20 bg-primary-foreground/10 p-5 backdrop-blur-sm"
              >
                <ShieldCheck className="h-5 w-5 opacity-90" />
                <p className="mt-3 font-semibold tracking-tight">{c.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed opacity-85">{c.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 rounded-2xl border border-primary-foreground/20 bg-primary-foreground/10 p-6 backdrop-blur-sm sm:p-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-foreground/20">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold tracking-tight">
                  Why we refuse to match a headline from Auriko.
                </h3>
                <p className="mt-2 text-[15px] leading-relaxed opacity-85">
                  Tools like Auriko advertise cost reduction by citing their own internal reports —
                  not independent, third-party verification. CostMyAI will not certify a switch we
                  cannot prove against a published, independent benchmark. A global routing dial
                  that silently reroutes traffic might move most of your workloads; we would refuse
                  to certify most of those moves because they lack per-workload proof. When the
                  benchmark cannot separate the models, you get a refusal and the reason — not a
                  weaker suggestion dressed up as a saving.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-10 text-center">
            <Link
              to="/legal/methodology"
              className="inline-flex items-center gap-1.5 text-sm font-semibold underline-offset-4 hover:underline"
            >
              Read the full Methodology →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------- 10 · faq ------------------------------- */

function Faq({ stats }: { stats: MarketingStats }) {
  const items = [
    {
      q: "Do you see our prompts or hold our provider keys?",
      a: "No, and not as a policy — as an architecture. The Verification Engine runs in your environment and holds your keys there. What reaches CostMyAI is aggregate metadata: model name, host, task class, token counts, latency, status. The ingest schema rejects prompt or completion content outright, so there is no path for it to arrive even by mistake.",
    },
    {
      q: "How is a saving actually calculated?",
      a: "We reprice your own observed token mix against every host serving that model, using one cost function shared by the product and this website. For a different model, its benchmark score must clear your current model's score minus that evaluation's own measured margin — and the cheapest option clearing the bar wins, never the highest-scoring or a partner's.",
    },
    {
      q: "Which providers and models are covered?",
      a: `Currently ${stats.modelCount} models across ${stats.providerCount} providers, with prices read from live public feeds. Coverage is stated live on this page rather than as a marketing round number, and a provider only appears once we hold a verified price row for it.`,
    },
    {
      q: "Does our application code have to change?",
      a: "One environment variable. Your application points at the Verification Engine endpoint instead of the provider's, and requests forward unchanged. If CostMyAI goes down, your inference does not — the engine keeps forwarding.",
    },
    {
      q: "What happens when no saving can be verified?",
      a: "You get a refusal that names the reason: the benchmark cannot separate the models on that task class, nothing cheaper clears the quality bar, or the measurement simply does not exist yet. We do not fill that gap with an alternative we cannot prove. Competitors quote a headline cost reduction citing their own internal report; we would rather show you the switch we refused to certify.",
    },
  ];

  const [open, setOpen] = useState(-1);

  return (
    <section id="faq" className="scroll-mt-24 border-t border-border bg-card">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
        <SectionHead eyebrow="FAQ" title="Common questions, accurate answers." />
        <div className="mx-auto mt-12 max-w-3xl divide-y divide-border overflow-hidden rounded-[1.5rem] border border-border bg-background">
          {items.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={item.q}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? -1 : i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-4 px-6 py-5 text-left"
                >
                  <span className="flex-1 font-semibold tracking-tight">{item.q}</span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {isOpen ? (
                  <p className="px-6 pb-6 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- 11 · closing ------------------------------ */

function ClosingCta() {
  return (
    <section className="px-5 py-20 sm:px-8">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] fill-gradient-brand px-8 py-16 text-center text-primary-foreground sm:px-16">
        <div className="absolute inset-0 texture-dots opacity-20" aria-hidden />
        <div className="relative">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Stop absorbing your AI spend. Start governing it.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed opacity-90">
            Connect once and get a complete, defensible breakdown of every workload in under 60
            seconds — what holds quality cheaper, what does not, and exactly what we refuse to
            certify.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/auth"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-background px-6 py-3 text-[15px] font-semibold text-foreground transition-transform hover:-translate-y-px"
            >
              Start free
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href={BOOK_DEMO_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-primary-foreground/40 px-6 py-3 text-[15px] font-semibold transition-colors hover:bg-primary-foreground/10"
            >
              Book a Demo
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function SectionHead({
  eyebrow,
  title,
  lead,
  align = "center",
}: {
  eyebrow: string;
  title: string;
  lead?: string;
  align?: "center" | "left";
}) {
  return (
    <div className={align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-xl"}>
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-bold tracking-[-0.028em] sm:text-4xl">{title}</h2>
      {lead ? <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">{lead}</p> : null}
    </div>
  );
}
