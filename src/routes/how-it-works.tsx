import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { ArchitectureDiagram } from "@/components/marketing/ArchitectureDiagram";
import { PriceDriftRibbon } from "@/components/marketing/PriceDriftRibbon";
import { Reveal } from "@/components/marketing/Reveal";
import { BOOK_DEMO_URL } from "@/lib/marketing-links";
import { marketingStatsQuery, type MarketingStats } from "@/lib/marketing.functions";
import { PLAN_META, PLAN_ORDER } from "@/lib/engine/types";
import type { PlanTier } from "@/lib/engine/types";
import { PLAN_FEATURES } from "@/lib/plan-features";
import { HOW_STEPS, dashboardShot } from "@/lib/how-it-works";
import { PROVIDER_PRESETS } from "@/lib/ingest/contract";
import { FAQ_CLUSTERS, faqJsonLdFor } from "@/lib/faq/questions";

/**
 * The full "how it works" explanation, promoted out of the homepage's
 * scroll anchor. Copy comes from src/lib/how-it-works.ts and the plan blocks
 * read PLAN_META / PLAN_FEATURES — no fifth copy of either lives here.
 */

const TITLE = "How It Works — CostMyAI";
const DESCRIPTION =
  "Run a small connector in your environment, point your SDK base URL at it, and get benchmark-backed switching decisions. No provider keys, no migration, no prompt content leaving your stack.";

export const Route = createFileRoute("/how-it-works")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://www.costmyai.com/how-it-works" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://www.costmyai.com/how-it-works" }],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(marketingStatsQuery()),
  component: HowItWorksPage,
});

function HowItWorksPage() {
  const { data: stats } = useSuspenseQuery(marketingStatsQuery());
  return (
    <MarketingShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: faqJsonLdFor([
            "does-costmyai-hold-keys",
            "what-data-costmyai-sees",
            "will-switching-hurt-quality",
            "no-safe-alternative",
            "multi-provider-risk",
          ]),
        }}
      />
      <Hero stats={stats} />
      <BeforeYouStart />
      <Steps />
      <Architecture stats={stats} />
      <Plans stats={stats} />
      <Objections />
      <Close />
    </MarketingShell>
  );
}

/* --------------------------------- hero ---------------------------------- */

function Hero({ stats }: { stats: MarketingStats }) {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div
        className="pointer-events-none absolute inset-x-0 -top-24 h-[130%] mesh-brand mesh-drift"
        aria-hidden
      />
      {/* First sighting of the band: a shallow diagonal, almost gone. */}
      <PriceDriftRibbon
        moves={stats.priceChangesTracked}
        orientation="diagonal"
        className="absolute inset-x-0 bottom-0 h-[55%] opacity-[0.12] [mask-image:linear-gradient(180deg,transparent,#000_70%)]"
      />
      <div className="absolute inset-0 texture-dots opacity-50" aria-hidden />

      <div className="relative mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
        <Reveal className="max-w-3xl">
          <p className="eyebrow">How It Works</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.045em] sm:text-[3.75rem] sm:leading-[1.02]">
            Connect once.{" "}
            <span className="text-gradient-brand-wide">Governed decisions</span> on every workload.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Run a small connector in your environment, point your SDK base URL at it, and keep
            your provider keys exactly where they are today. CostMyAI sees only metadata.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link to="/auth" className="btn-gradient px-5 py-2.5 text-sm">
              Start free
            </Link>
            <a
              href={BOOK_DEMO_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-full border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              Book a Demo
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* --------------------------- before you start ----------------------------- */

function BeforeYouStart() {
  const facts = [
    "No provider keys required",
    "Works with your existing SDK",
    "Setup in minutes, not a migration",
    "Verdicts appear once real traffic flows",
  ];
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="grid gap-4 py-8 sm:grid-cols-2 lg:grid-cols-4">
          {facts.map((f) => (
            <div key={f} className="flex items-start gap-3 text-sm text-muted-foreground">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span className="text-balance">{f}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------- steps --------------------------------- */

function Steps() {
  return (
    <section className="wash-brand">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-28">
        <div className="mx-auto max-w-4xl">
          {HOW_STEPS.map((s, i) => (
            <Reveal
              key={s.n}
              delay={i * 90}
              className="group relative grid gap-4 border-t border-border py-10 sm:grid-cols-[9rem_1fr] sm:gap-10 sm:py-14"
            >
              <span
                aria-hidden
                className="num pointer-events-none select-none text-[3.5rem] leading-none text-gradient-brand opacity-30 transition-opacity duration-500 group-hover:opacity-100 sm:text-[5rem]"
              >
                {s.n}
              </span>
              <div className="sm:pt-2">
                <h2 className="text-2xl font-semibold tracking-[-0.035em] sm:text-[2rem]">
                  {s.title}
                </h2>
                <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
                  {s.body}
                </p>
                {s.n === "01" && <ConnectSnippet />}
                <ul className="mt-6 flex flex-col gap-2.5">
                  {s.detail.map((d) => (
                    <li key={d} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span className="max-w-2xl leading-relaxed">{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
          <div className="border-t border-border" />
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- connect snippet --------------------------- */

function ConnectSnippet() {
  const [presetId, setPresetId] = useState(PROVIDER_PRESETS[0].id);
  const preset = PROVIDER_PRESETS.find((p) => p.id === presetId) ?? PROVIDER_PRESETS[0];
  const base = `http://localhost:${preset.port}${preset.sdkPath}`;
  const envLine = `${preset.sdkEnv}=${base}`;
  const code = preset.typescript.replace(/\{BASE\}/g, base);

  return (
    <div className="mt-6 overflow-hidden rounded-xl border border-border bg-background/60">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        {PROVIDER_PRESETS.slice(0, 3).map((p) => (
          <button
            key={p.id}
            onClick={() => setPresetId(p.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              p.id === preset.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="grid gap-px bg-border sm:grid-cols-2">
        <div className="bg-background/60 p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Environment
          </p>
          <code className="mt-2 block font-mono text-xs text-foreground">{envLine}</code>
        </div>
        <div className="bg-background/60 p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            SDK
          </p>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-xs text-foreground">
            {code}
          </pre>
        </div>
      </div>
      <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
        Your application keeps sending its own provider key. Only the base URL changes.
      </p>
    </div>
  );
}

/* ----------------------------- architecture ------------------------------ */

function Architecture({ stats }: { stats: MarketingStats }) {
  return (
    <section className="relative overflow-hidden border-t border-border">
      {/* The statement placement: a whisper at the bottom edge, never behind body copy. */}
      <PriceDriftRibbon
        moves={stats.priceChangesTracked}
        className="absolute inset-x-0 bottom-0 h-[26%] opacity-25 [mask-image:linear-gradient(180deg,transparent_0%,transparent_70%,#000_100%)]"
      />
      <div className="relative mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-28">
        <div className="rule-brand absolute inset-x-5 top-0 sm:inset-x-8" aria-hidden />

        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="eyebrow">The request path</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] sm:text-[2.5rem]">
            Runs in your environment. Sees only metadata.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-muted-foreground">
            The Verification Engine sits in your stack as middleware. Requests pass through
            unchanged; only token counts and model names leave your environment. Never prompt
            content.
          </p>
        </Reveal>
        <Reveal delay={80} className="mt-14">
          <ArchitectureDiagram />
        </Reveal>
      </div>
    </section>
  );
}

/* --------------------------------- plans --------------------------------- */

const LEVEL_PICKER: { plan: PlanTier; line: string }[] = [
  { plan: "compare", line: "You want to know if a cheaper host exists for the same model." },
  { plan: "certify", line: "You need to prove quality before you switch to a cheaper model." },
  { plan: "rightsize", line: "You want the switch executed, but you stay in control." },
  { plan: "govern", line: "You want switching continuous, bounded, and audited." },
];

function Plans({ stats }: { stats: MarketingStats }) {
  return (
    <section className="relative overflow-hidden border-t border-border wash-brand">
      {/* The echo: same band, quarter-turned, pinned to the gutter. */}
      <PriceDriftRibbon
        moves={stats.priceChangesTracked}
        orientation="vertical"
        className="absolute inset-y-0 right-0 hidden w-[16%] opacity-[0.18] [mask-image:linear-gradient(270deg,#000,transparent)] lg:block"
      />
      <div className="relative mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-28">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="eyebrow">Level by level</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] sm:text-[2.5rem]">
            What each level actually does.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-muted-foreground">
            Same four steps at every level. What changes is how far the verdict is allowed to go.
          </p>
        </Reveal>

        <Reveal delay={80} className="mt-14">
          <div className="grid gap-4 border-y border-border py-8 sm:grid-cols-2 lg:grid-cols-4">
            {LEVEL_PICKER.map(({ plan, line }) => (
              <div key={plan} className="text-sm">
                <p className="font-semibold text-foreground">{PLAN_META[plan].label}</p>
                <p className="mt-1 leading-relaxed text-muted-foreground">{line}</p>
              </div>
            ))}
          </div>
        </Reveal>

        <div className="mt-20 flex flex-col gap-20">
          {PLAN_ORDER.map((plan, i) => (
            <PlanBlock key={plan} plan={plan} index={i} />
          ))}
        </div>

        <Reveal className="mt-16 text-center">
          <Link
            to="/pricing"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            See the full plan comparison <ArrowRight className="h-4 w-4" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

function PlanBlock({ plan, index }: { plan: PlanTier; index: number }) {
  const meta = PLAN_META[plan];
  const flip = index % 2 === 1;
  return (
    <Reveal className="grid items-center gap-10 border-t border-border pt-12 lg:grid-cols-2 lg:gap-16">
      <div className={flip ? "lg:order-2" : undefined}>
        <p className="eyebrow">
          Level <span className="num">{index + 1}</span>
        </p>
        <h3 className="mt-3 text-2xl font-semibold tracking-[-0.035em] sm:text-[2rem]">
          {meta.label}
        </h3>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">{meta.blurb}</p>
        <p className="num mt-4 text-sm text-muted-foreground">
          {meta.monthly === 0 ? "Free forever" : `From $${meta.yearly}/mo billed yearly`}
        </p>
        <ul className="mt-6 flex flex-col gap-2.5">
          {PLAN_FEATURES[plan].map((f) => (
            <li key={f} className="flex items-start gap-2.5 text-sm text-muted-foreground">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span className="leading-relaxed">{f}</span>
            </li>
          ))}
        </ul>
      </div>
      <DashboardShot plan={plan} label={meta.label} />
    </Reveal>
  );
}

/**
 * Aspect-ratio-reserved frame for the real dashboard capture. Until the file
 * exists the frame keeps its space and caption; the <img> hides itself on
 * error so no broken-image icon is ever shown.
 */
function DashboardShot({ plan, label }: { plan: PlanTier; label: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <figure className="overflow-hidden rounded-xl border border-border/60 shadow-[0_40px_80px_-40px_rgba(23,15,60,0.4)]">
      <div className="relative aspect-[16/10] w-full">
        <div className="absolute inset-0 mesh-brand opacity-40" aria-hidden />
        {failed ? null : (
          <img
            src={dashboardShot(plan)}
            alt={`The ${label} dashboard in CostMyAI, showing the switches and measurements available at that level`}
            loading="lazy"
            onError={() => setFailed(true)}
            className="absolute inset-0 h-full w-full object-cover object-left-top"
          />
        )}
      </div>
      <div className="rule-brand" aria-hidden />
      <figcaption className="px-4 py-3 text-xs text-muted-foreground">
        {label}: the workspace view at this level.
      </figcaption>
    </figure>
  );
}

/* ------------------------------- objections ------------------------------ */

const OBJECTION_IDS = [
  "does-costmyai-hold-keys",
  "what-data-costmyai-sees",
  "will-switching-hurt-quality",
  "no-safe-alternative",
  "multi-provider-risk",
];

function Objections() {
  const items = FAQ_CLUSTERS.flatMap((c) => c.items).filter((i) => OBJECTION_IDS.includes(i.id));
  return (
    <section className="border-t border-border">
      <div className="mx-auto max-w-4xl px-5 py-24 sm:px-8 sm:py-28">
        <Reveal className="text-center">
          <p className="eyebrow">What teams ask before they start</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] sm:text-[2.5rem]">
            Security, quality, and fallback.
          </h2>
        </Reveal>

        <div className="mt-14 flex flex-col gap-8">
          {items.map((item) => (
            <Reveal key={item.id}>
              <details className="group border-b border-border pb-8">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-base font-semibold text-foreground">
                  {item.q}
                  <span className="mt-1 inline-block h-2 w-2 rotate-45 border-b-2 border-r-2 border-primary transition-transform group-open:-rotate-45" />
                </summary>
                <p className="mt-4 max-w-3xl leading-relaxed text-muted-foreground">{item.a}</p>
              </details>
            </Reveal>
          ))}

          <Reveal>
            <details className="group border-b border-border pb-8">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-base font-semibold text-foreground">
                Does the connector add latency or break streaming?
                <span className="mt-1 inline-block h-2 w-2 rotate-45 border-b-2 border-r-2 border-primary transition-transform group-open:-rotate-45" />
              </summary>
              <p className="mt-4 max-w-3xl leading-relaxed text-muted-foreground">
                The connector forwards requests and streams responses without buffering them. It
                counts tokens from the response headers or tail, so the added latency is typically
                sub-millisecond for non-streaming calls and zero for streaming bodies because they
                pass through unchanged. If the connector stops, your application falls back to the
                original provider base URL instantly — there is no dependency on CostMyAI being up
                for your traffic to keep flowing.
              </p>
            </details>
          </Reveal>

          <Reveal>
            <details className="group border-b border-border pb-8">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-base font-semibold text-foreground">
                What happens if CostMyAI is down when a switch is supposed to run?
                <span className="mt-1 inline-block h-2 w-2 rotate-45 border-b-2 border-r-2 border-primary transition-transform group-open:-rotate-45" />
              </summary>
              <p className="mt-4 max-w-3xl leading-relaxed text-muted-foreground">
                On Rightsize and below, switches are manual — you review and activate them yourself.
                On Govern, the connector re-checks the decision at the moment of action using a
                cached policy. If the policy cannot be refreshed and the decision is no longer
                within the configured equivalence band, the switch is refused rather than executed.
                The default is always to do nothing rather than guess.
              </p>
            </details>
          </Reveal>
        </div>

        <Reveal className="mt-12 text-center">
          <Link
            to="/faq"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            Read the full FAQ <ArrowRight className="h-4 w-4" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

/* --------------------------------- close --------------------------------- */

function Close() {
  return (
    <section className="relative overflow-hidden border-t border-border">
      <div className="absolute inset-0 mesh-brand mesh-drift opacity-70" aria-hidden />
      <div className="absolute inset-0 texture-dots opacity-40" aria-hidden />
      <div className="relative mx-auto max-w-3xl px-5 py-24 text-center sm:px-8 sm:py-28">
        <Reveal>
          <h2 className="text-3xl font-semibold tracking-[-0.035em] sm:text-[2.5rem]">
            Keep your keys. Change one URL. Then the evidence.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-muted-foreground">
            Compare is free forever, and it needs no provider keys to start.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link to="/auth" className="btn-gradient px-5 py-2.5 text-sm">
              Start free
            </Link>
            <Link
              to="/standard"
              className="rounded-full border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              Read the CostMyAI Standard
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
