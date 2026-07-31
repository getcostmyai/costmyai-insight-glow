import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  Gauge,
  KeyRound,
  LineChart,
  Scale,
  ShieldCheck,
  Sparkles,
  Timer,
} from "lucide-react";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { marketingStatsQuery, type MarketingStats } from "@/lib/marketing.functions";
import { PLAN_META } from "@/lib/engine/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CostMyAI — cut your AI bill without changing your output" },
      {
        name: "description",
        content:
          "CostMyAI reads only metadata from your gateway, proves where the same quality costs less, and switches you there. No provider keys, no prompt content, every claim tied to a measurement.",
      },
      { property: "og:title", content: "CostMyAI — cut your AI bill without changing your output" },
      {
        property: "og:description",
        content:
          "Certified, quality-checked model and host switches. Zero credentials held, live prices, published measurement margins.",
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
      <LiveCoverage stats={stats} />
      <HowItWorks />
      <Anatomy stats={stats} />
      <Neutrality />
      <PrivacyByDesign />
      <Rungs />
      <ClosingCta />
    </MarketingShell>
  );
}

/* -------------------------------------------------------------------------- */

function Hero({ stats }: { stats: MarketingStats }) {
  return (
    <section className="relative overflow-hidden wash-hero">
      <div className="absolute inset-0 texture-dots opacity-60" aria-hidden />
      <div className="relative mx-auto max-w-6xl px-5 pb-24 pt-20 sm:px-8 sm:pb-28 sm:pt-28">
        <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-saving animate-pulse-dot" />
              Live prices synced <span className="num text-foreground">{stats.pricesSyncedAgo}</span>
            </span>

            <h1 className="mt-6 text-[2.7rem] font-bold leading-[1.03] tracking-[-0.03em] sm:text-6xl">
              Your AI bill has a<br />
              <span className="text-gradient-brand">cheaper twin.</span>
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Same model on a cheaper host. A different model that benchmarks the same. A frontier
              model doing work a small one does identically. CostMyAI finds all three from your
              gateway metadata — and proves each one before it moves anything.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link to="/auth" className="btn-gradient px-6 py-3 text-[15px]">
                See if you're overpaying
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/demo" className="btn-quiet px-6 py-3 text-[15px]">
                Open the live demo
              </Link>
            </div>

            <p className="mt-5 text-sm text-muted-foreground">
              Free on Compare, forever. No card. No provider keys — ever.
            </p>
          </div>

          <HeroCard />
        </div>
      </div>
    </section>
  );
}

/**
 * The hero visual: one certified switch, shown the way the product shows it.
 * The figures are the anatomy of a recommendation, not a claimed customer result.
 */
function HeroCard() {
  return (
    <div className="relative animate-rise">
      <div className="absolute -inset-6 rounded-[2.5rem] fill-gradient-brand opacity-[0.14] blur-2xl" aria-hidden />
      <div className="relative card-surface overflow-hidden p-0 shadow-[var(--shadow-float)]">
        <div className="fill-gradient-brand px-6 py-5 text-primary-foreground">
          <p className="text-[11px] font-semibold uppercase tracking-[0.09em] opacity-80">
            Certified switch
          </p>
          <p className="num mt-1 text-3xl">$1,284.40</p>
          <p className="mt-0.5 text-sm opacity-90">saved per month, quality held</p>
        </div>

        <div className="space-y-4 p-6">
          <SwitchRow label="From" model="claude-opus-4-7" host="Anthropic" price="$15.00 / $75.00" />
          <div className="flex items-center gap-3 pl-1">
            <ArrowRight className="h-4 w-4 shrink-0 text-primary" />
            <span className="text-xs text-muted-foreground">
              cheapest option clearing the measured quality bar
            </span>
          </div>
          <SwitchRow
            label="To"
            model="gpt-5.5"
            host="Azure OpenAI"
            price="$3.20 / $12.80"
            highlight
          />

          <div className="grid grid-cols-3 gap-3 pt-2">
            <MiniStat label="Quality Δ" value="+0.31" tone="saving" />
            <MiniStat label="Margin" value="±0.94" tone="spend" />
            <MiniStat label="Latency" value="820ms" tone="frozen" />
          </div>

          <p className="rounded-xl bg-secondary px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
            Scores are within the evaluation's own resolution, so the two are indistinguishable on
            this task class — that is the whole claim, and it is the only one we make.
          </p>
        </div>
      </div>
    </div>
  );
}

function SwitchRow({
  label,
  model,
  host,
  price,
  highlight = false,
}: {
  label: string;
  model: string;
  host: string;
  price: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border px-3.5 py-3 ${
        highlight ? "border-primary/35 bg-primary-soft" : "border-border bg-card"
      }`}
    >
      <div className="min-w-0">
        <p className="eyebrow">{label}</p>
        <p className="truncate font-mono text-[13px] font-medium">{model}</p>
        <p className="truncate text-xs text-muted-foreground">{host}</p>
      </div>
      <p className="num shrink-0 text-sm text-muted-foreground">{price}</p>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "saving" | "spend" | "frozen";
}) {
  const toneClass =
    tone === "saving" ? "text-saving" : tone === "spend" ? "text-primary" : "text-muted-foreground";
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5">
      <p className="eyebrow">{label}</p>
      <p className={`num mt-0.5 text-base ${toneClass}`}>{value}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function LiveCoverage({ stats }: { stats: MarketingStats }) {
  const items = [
    { value: stats.modelsTracked, label: "models in the catalogue" },
    { value: stats.hostsPriced, label: "hosts priced" },
    { value: stats.pricePoints, label: "live price points" },
    { value: stats.evaluations, label: "evaluations with published item counts" },
  ];

  return (
    <section className="border-y border-border bg-card">
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item) => (
            <div key={item.label}>
              <p className="num text-3xl text-foreground">{item.value}</p>
              <p className="mt-1 text-sm text-muted-foreground">{item.label}</p>
            </div>
          ))}
        </div>
        <p className="mt-8 text-xs text-muted-foreground">
          Read live from the same tables the engine prices against. Pricing feed last completed{" "}
          <span className="num text-foreground">{stats.pricesSyncedAgo}</span>; benchmark margins{" "}
          <span className="num text-foreground">{stats.benchmarksSyncedAgo}</span>
          {stats.marginMethod ? (
            <>
              {" "}
              (<span className="font-mono">{stats.marginMethod}</span>)
            </>
          ) : null}
          .
        </p>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

const STEPS = [
  {
    icon: LineChart,
    title: "Connect the gateway",
    body: "A container sits beside your stack and pushes metadata only: model, host, task class, token counts, latency. Your keys stay in your container. If we go down, your inference does not.",
  },
  {
    icon: Scale,
    title: "Price it against the live feed",
    body: "Every workload is repriced across every host that serves that model, using the same cost function the dashboard shows you. The cheapest host for what you already run becomes the baseline.",
  },
  {
    icon: CheckCircle2,
    title: "Prove the quality claim",
    body: "A cheaper model is only offered when its score clears the current one's, minus the evaluation's own measurement margin. Anything unmeasured is refused — out loud, with the reason.",
  },
  {
    icon: Gauge,
    title: "Switch, and keep watching",
    body: "Activate a switch manually, or let Govern do it inside the equivalence band. Every switch is reversible in one click, audited, and measured against what it replaced.",
  },
];

function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-24 wash-section">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
        <SectionHead
          eyebrow="How it works"
          title="Four steps, and none of them touch your prompts."
          lead="From connecting a gateway to a live switch, every stage is metadata in, measurement out."
        />

        <div className="mt-14 grid gap-5 md:grid-cols-2">
          {STEPS.map((step, i) => (
            <div key={step.title} className="card-surface group relative overflow-hidden p-7">
              <div className="flex items-start gap-4">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl fill-gradient-brand text-primary-foreground">
                  <step.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="num text-xs text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </p>
                  <h3 className="mt-0.5 text-lg font-semibold tracking-tight">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function Anatomy({ stats }: { stats: MarketingStats }) {
  return (
    <section className="border-y border-border bg-card">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
        <div className="grid gap-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div>
            <SectionHead
              align="left"
              eyebrow="What a claim rests on"
              title="Every number states its own evidence."
              lead="A recommendation you cannot audit is a guess with a dollar sign in front of it."
            />
            <Link to="/demo" className="btn-quiet mt-8 px-5 py-2.5 text-sm">
              See it on a live workspace
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="space-y-3">
            <EvidenceRow
              icon={CircleDollarSign}
              title="The price"
              body={`Both sides priced from the live feed, last synced ${stats.pricesSyncedAgo}, on your own token mix rather than a list-price comparison.`}
            />
            <EvidenceRow
              icon={Sparkles}
              title="The quality bar"
              body={`One evaluation per task class, scored for every model, with the bar set by the evaluation's 95% measurement margin${stats.marginMethod ? ` (${stats.marginMethod})` : ""} — never a hardcoded tolerance.`}
            />
            <EvidenceRow
              icon={Timer}
              title="The latency"
              body="Time-to-first-token plus your workload's own output length. A 40-token classification and a 4,000-token draft are not the same wait, so they are not priced as one."
            />
            <EvidenceRow
              icon={ShieldCheck}
              title="The refusal"
              body="When nothing clears, you get the refusal and its reason instead of a weaker suggestion. Refusals are a product surface, not an error state."
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function EvidenceRow({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof ShieldCheck;
  title: string;
  body: string;
}) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-border bg-background p-5">
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="font-semibold tracking-tight">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Neutrality() {
  const clauses = [
    "No provider pays for placement, ranking, or inclusion. There is no ad slot to buy.",
    "The cheapest option clearing the quality bar wins — not the highest-scoring, not a partner's.",
    "Ties break on cost, then alphabetically. The rule is fixed so no thumb can rest on the scale.",
    "Every claim of equivalence names the evaluation, the score and the margin it was judged on.",
  ];

  return (
    <section id="neutrality" className="scroll-mt-24 wash-section">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
        <SectionHead
          eyebrow="Neutrality charter"
          title="We are paid by you. Only by you."
          lead="A cost advisor with a revenue share from the destination is a sales channel wearing a lab coat."
        />
        <div className="mx-auto mt-12 grid max-w-4xl gap-3 sm:grid-cols-2">
          {clauses.map((c) => (
            <div key={c} className="flex items-start gap-3 rounded-2xl border border-border bg-card p-5">
              <CheckCircle2 className="mt-0.5 h-4.5 w-4.5 shrink-0 text-saving" />
              <p className="text-sm leading-relaxed text-muted-foreground">{c}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function PrivacyByDesign() {
  return (
    <section id="privacy-by-design" className="scroll-mt-24 border-y border-border bg-card">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
        <div className="grid items-center gap-14 lg:grid-cols-2">
          <div>
            <SectionHead
              align="left"
              eyebrow="Zero credentials"
              title="We could not call your providers if we wanted to."
              lead="This is an architectural property, not a policy promise. There is no column in our database that could hold a provider key, and a test fails the build if one ever appears."
            />
          </div>

          <div className="space-y-3">
            <NoRow icon={KeyRound} text="No provider API keys leave your infrastructure." />
            <NoRow icon={ShieldCheck} text="No prompts, completions, or user content — the ingest schema rejects them outright." />
            <NoRow icon={LineChart} text="Metadata only: model, host, task class, token counts, latency, status." />
            <NoRow icon={CircleDollarSign} text="Invoice reconciliation is customer-pushed. We never poll your billing API." />
          </div>
        </div>
      </div>
    </section>
  );
}

function NoRow({ icon: Icon, text }: { icon: typeof ShieldCheck; text: string }) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-border bg-background p-5">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

const RUNG_ORDER = ["compare", "certify", "rightsize", "govern"] as const;

function Rungs() {
  return (
    <section className="wash-section">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
        <SectionHead
          eyebrow="The ladder"
          title="Start free. Climb only when the rung below has paid for itself."
          lead="Each rung adds one capability, and every rung above Compare runs the ones below it."
        />

        <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {RUNG_ORDER.map((plan, i) => {
            const meta = PLAN_META[plan];
            const featured = plan === "rightsize";
            return (
              <div
                key={plan}
                className={`relative overflow-hidden rounded-3xl border p-6 ${
                  featured
                    ? "border-primary/40 bg-primary-soft shadow-[var(--shadow-card)]"
                    : "border-border bg-card shadow-[var(--shadow-card)]"
                }`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-semibold tracking-tight">{meta.label}</p>
                  <p className="num text-xs text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </p>
                </div>
                <p className="num mt-4 text-3xl">
                  {meta.monthly === 0 ? "Free" : `$${meta.monthly}`}
                  {meta.monthly === 0 ? null : (
                    <span className="text-sm font-medium text-muted-foreground"> /mo</span>
                  )}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{meta.blurb}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-10 text-center">
          <Link to="/pricing" className="btn-quiet px-6 py-3 text-[15px]">
            Full pricing and what each rung includes
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function ClosingCta() {
  return (
    <section className="px-5 pb-24 sm:px-8">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] fill-gradient-brand px-8 py-16 text-center text-primary-foreground sm:px-16">
        <div className="absolute inset-0 texture-dots opacity-20" aria-hidden />
        <div className="relative">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Find out what you're overpaying — today.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed opacity-90">
            Compare is free forever: same model, cheaper host, on your own traffic. Connect a
            gateway and the first certified switches show up on the same day.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/auth"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-background px-6 py-3 text-[15px] font-semibold text-foreground transition-transform hover:-translate-y-px"
            >
              Start free
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/demo"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-primary-foreground/40 px-6 py-3 text-[15px] font-semibold transition-colors hover:bg-primary-foreground/10"
            >
              Watch the live demo
            </Link>
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
    <div className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-xl"}>
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-bold tracking-[-0.028em] sm:text-4xl">{title}</h2>
      {lead ? <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">{lead}</p> : null}
    </div>
  );
}
