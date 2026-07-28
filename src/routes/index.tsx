import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  ChevronDown,
  Gauge,
  Layers,
  LineChart,
  Settings,
  ShieldCheck,
  Snowflake,
  Sparkle,
  TrendingDown,
  Zap,
} from "lucide-react";
import { SavingsRing } from "@/components/dashboard/SavingsRing";
import { SpendChart } from "@/components/dashboard/SpendChart";
import { SwitchCard } from "@/components/dashboard/SwitchCard";
import {
  activeSwitches,
  cheaperHost,
  gatewaySpend,
  kpis,
  overpowered,
  pipeline,
  qualityMatched,
  usd,
} from "@/lib/dashboard-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Rightsize Dashboard — CostMyAI" },
      {
        name: "description",
        content:
          "See what your AI gateway really costs, which certified switches are saving money today, and how much is still on the table.",
      },
      { property: "og:title", content: "Rightsize Dashboard — CostMyAI" },
      {
        property: "og:description",
        content:
          "Certified, quality-checked model and host switches that cut AI spend without touching output quality.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

const navItems = [
  { label: "Overview", icon: Layers },
  { label: "Compare", icon: LineChart },
  { label: "Certify", icon: BadgeCheck },
  { label: "Rightsize", icon: Gauge, active: true },
  { label: "Govern", icon: ShieldCheck, href: "#govern" },
];

const topNav = ["Analyzer", "Calculators", "Models", "Intelligence", "Blog", "Plans"];

function Dashboard() {
  const totalOpportunity = kpis.activeSaving + kpis.availableSaving;
  const annualised = totalOpportunity * 12;

  return (
    <div className="min-h-screen bg-background">
      {/* Masthead */}
      <header className="glass sticky top-0 z-40 border-b border-border">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-8 px-5 lg:px-8">
          <span className="text-xl font-bold tracking-tight">
            Cost<span className="text-primary">My</span>AI
          </span>
          <nav className="hidden items-center gap-7 lg:flex">
            {topNav.map((item) => (
              <a
                key={item}
                href="#"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {item}
              </a>
            ))}
          </nav>
          <button className="ml-auto rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-transform hover:scale-[1.02] active:scale-95">
            See if you're overpaying
          </button>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1440px] gap-8 px-5 py-8 lg:px-8">
        {/* Sidebar */}
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-24 space-y-6">
            <div>
              <p className="text-sm font-semibold">Preview User</p>
              <span className="mt-2 inline-flex rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold tracking-widest text-primary-foreground uppercase">
                Rightsize
              </span>
            </div>
            <nav className="space-y-1">
              {navItems.map(({ label, icon: Icon, active, href }) => (
                <a
                  key={label}
                  href={href ?? "#"}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                    active
                      ? "bg-primary-soft font-semibold text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="size-4" />
                  {label}
                </a>
              ))}
            </nav>
            <div className="space-y-1 border-t border-border pt-5">
              <p className="eyebrow px-3 pb-1">Account</p>
              {["Settings", "Workspace"].map((l) => (
                <a
                  key={l}
                  href="#"
                  className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
                >
                  <Settings className="size-4" />
                  {l}
                </a>
              ))}
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 space-y-8">
          {/* 1 — The headline answer */}
          <section
            className="animate-rise relative overflow-hidden rounded-3xl p-6 text-white sm:p-10"
            style={{ background: "var(--gradient-hero)" }}
          >
            <div
              className="pointer-events-none absolute -top-32 -right-24 size-96 rounded-full opacity-40 blur-3xl"
              style={{ background: "var(--gradient-spend)" }}
            />
            <div className="relative grid gap-10 lg:grid-cols-[1.15fr_auto] lg:items-center">
              <div>
                <div className="flex items-center gap-2 text-xs text-white/70">
                  <span className="animate-pulse-dot inline-block size-2 rounded-full bg-[oklch(0.78_0.18_150)]" />
                  Live · last rule execution synced {gatewaySpend.syncedAgo}
                </div>
                <h1 className="mt-4 text-3xl leading-tight font-semibold sm:text-[2.6rem]">
                  You can stop paying{" "}
                  <span className="num text-[oklch(0.83_0.11_195)]">
                    {usd(kpis.availableSaving)}
                  </span>{" "}
                  <span className="text-white/80">a month — today.</span>
                </h1>
                <p className="mt-3 max-w-xl text-sm text-white/70">
                  {kpis.certifiedSwitches} certified switches are waiting. Every one of them is
                  quality-checked against your own traffic — same output, lower bill.
                </p>

                <div className="mt-8 grid gap-6 sm:grid-cols-3">
                  <HeroStat
                    label="Already saving"
                    value={usd(kpis.activeSaving)}
                    sub={`${kpis.activeSwitches} active switches`}
                    accent="oklch(0.82 0.16 155)"
                  />
                  <HeroStat
                    label="Still on the table"
                    value={usd(kpis.availableSaving)}
                    sub={`${kpis.certifiedSwitches} certified switches`}
                    accent="oklch(0.83 0.11 195)"
                  />
                  <HeroStat
                    label="Annualised upside"
                    value={usd(annualised, 0)}
                    sub="if all switches stay on"
                    accent="oklch(0.85 0.1 300)"
                  />
                </div>

                <button className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-[oklch(0.22_0.07_285)] transition-transform hover:scale-[1.02] active:scale-95">
                  Activate all certified switches
                  <ArrowRight className="size-4" />
                </button>
              </div>

              <div className="lg:pl-6">
                <SavingsRing captured={kpis.activeSaving} available={kpis.availableSaving} />
                <div className="mt-4 flex justify-center gap-5 text-xs text-white/70">
                  <Legend color="oklch(0.65 0.15 158)" label="Captured" />
                  <Legend color="oklch(0.72 0.11 195)" label="Available" />
                </div>
              </div>
            </div>
          </section>

          {/* 2 — Context: what you actually spend */}
          <section className="card-surface p-6 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="eyebrow">Gateway spend · last 30 days</p>
                <div className="mt-3 flex flex-wrap items-baseline gap-x-8 gap-y-2">
                  <Metric value="$2.3k" label="tracked" tone="text-spend" />
                  <Metric value="99,944" label="requests" />
                  <Metric value="594M" label="tokens" />
                </div>
              </div>
              <div className="flex gap-1 rounded-full bg-muted p-1 text-xs font-medium">
                {["Spend", "Requests", "$/1M tok"].map((t, i) => (
                  <button
                    key={t}
                    className={`rounded-full px-3 py-1.5 transition-colors ${
                      i === 0
                        ? "bg-card text-primary shadow-[var(--shadow-card)]"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-6">
              <SpendChart />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {gatewaySpend.excludedModels} models excluded from the spend total — no pricing data
              available.
            </p>
          </section>

          {/* 3 — How we got there */}
          <section>
            <SectionTitle
              eyebrow="How your savings were found"
              title="The Rightsize pipeline"
              hint="Four automated checks run against your live traffic."
            />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {pipeline.map((p) => (
                <div
                  key={p.step}
                  className="card-surface relative overflow-hidden p-5 transition-transform hover:-translate-y-0.5"
                >
                  <span
                    className="absolute inset-x-0 top-0 h-1"
                    style={{
                      background:
                        p.tone === "saving"
                          ? "var(--gradient-saving)"
                          : p.tone === "opportunity"
                            ? "var(--gradient-opportunity)"
                            : "var(--gradient-spend)",
                    }}
                  />
                  <p className="eyebrow">Step {p.step}</p>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span
                      className={`num text-4xl ${
                        p.tone === "saving"
                          ? "text-saving"
                          : p.tone === "opportunity"
                            ? "text-opportunity"
                            : "text-spend"
                      }`}
                    >
                      {p.value}
                    </span>
                    <span className="text-xs text-muted-foreground">{p.unit}</span>
                  </div>
                  <p className="mt-3 text-sm font-semibold">{p.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{p.detail}</p>
                </div>
              ))}
            </div>
          </section>

          {/* 4 — Act: ranked opportunities */}
          <section>
            <SectionTitle
              eyebrow="Ranked by monthly saving"
              title="Same model, cheaper host"
              hint="Identical model weights, a cheaper provider. Zero quality risk."
              badge={`${cheaperHost.length} certified`}
              badgeTone="saving"
            />
            <div className="space-y-3">
              {cheaperHost.map((row, i) => (
                <SwitchCard key={row.fromModel + row.toHost} row={row} rank={i + 1} />
              ))}
            </div>
          </section>

          <section>
            <SectionTitle
              eyebrow="Quality-matched"
              title="Cheaper model, same measured quality"
              hint="Benchmarked against your own prompts before we recommend the swap."
              badge={`${qualityMatched.length} certified`}
              badgeTone="saving"
            />
            <div className="space-y-3">
              {qualityMatched.map((row, i) => (
                <SwitchCard key={row.fromModel + row.toModel} row={row} rank={i + 1} />
              ))}
            </div>
          </section>

          {/* 5 — Waste */}
          <section>
            <SectionTitle
              eyebrow="Attention needed"
              title="Overpowered for the task"
              hint="Frontier-tier models running work an economy tier handles."
              badge={`${overpowered.length} workloads`}
              badgeTone="opportunity"
            />
            <div className="grid gap-4 lg:grid-cols-2">
              {overpowered.map((o) => (
                <div
                  key={o.model}
                  className="rounded-2xl border border-opportunity/25 bg-opportunity-soft p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="font-mono text-base font-semibold">{o.model}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{o.host}</span>
                    </div>
                    <span className="rounded-full bg-opportunity px-2.5 py-1 text-[10px] font-bold tracking-wider text-white uppercase">
                      {o.tier}
                    </span>
                  </div>
                  <div className="mt-4 flex items-end gap-2">
                    <TrendingDown className="mb-1 size-4 text-opportunity" />
                    <span className="num text-3xl text-opportunity">{usd(o.wasted, 0)}</span>
                    <span className="pb-1 text-xs text-muted-foreground">
                      estimated monthly overspend
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{o.note}</p>
                </div>
              ))}
            </div>
          </section>

          {/* 6 — Proof: what's already running */}
          <section>
            <SectionTitle
              eyebrow="Working for you right now"
              title="Active switches"
              hint="Rerouting live traffic, ranked by certify basis."
              badge={`${kpis.activeSwitches} live`}
              badgeTone="spend"
            />
            <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
              <div className="space-y-3">
                {activeSwitches.map((s) => (
                  <div key={s.fromModel} className="card-surface p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase ${
                          s.badge === "Proven switch"
                            ? "bg-saving-soft text-saving"
                            : "bg-primary-soft text-primary"
                        }`}
                      >
                        <Zap className="size-3" />
                        {s.badge}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {s.basis} · since {s.since}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-mono text-sm text-muted-foreground">
                        {s.fromModel}
                      </span>
                      <ArrowRight className="size-3.5 text-primary" />
                      <span className="font-mono text-sm font-semibold text-primary">
                        {s.toModel}
                      </span>
                      <span className="text-[11px] text-muted-foreground">{s.toHost}</span>
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                      <span className="text-xs text-muted-foreground">Saved since activation</span>
                      <span className="num text-lg text-saving">+{usd(s.saved)}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-4">
                <div className="card-surface flex items-center gap-4 p-5">
                  <div className="flex size-11 items-center justify-center rounded-2xl bg-frozen-soft">
                    <Snowflake className="size-5 text-frozen" />
                  </div>
                  <div>
                    <div className="num text-3xl text-frozen">{kpis.frozen}</div>
                    <p className="text-xs text-muted-foreground">frozen switches · all healthy</p>
                  </div>
                </div>

                <div className="relative overflow-hidden rounded-2xl border border-saving/20 bg-saving-soft p-5">
                  <Sparkle className="absolute -top-3 -right-3 size-20 text-saving/10" />
                  <p className="text-sm font-semibold text-saving">
                    Govern would run these automatically
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Autonomous mode monitors certified workloads and applies routing decisions
                    continuously — no manual approval per switch.
                  </p>
                  <button className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-saving">
                    Upgrade to Govern
                    <ArrowUpRight className="size-4" />
                  </button>
                </div>
              </div>
            </div>
          </section>

          <p className="pb-6 text-center text-xs text-muted-foreground">
            Savings estimated from your tracked traffic and current provider pricing.
          </p>
        </main>
      </div>
    </div>
  );
}

function HeroStat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent: string;
}) {
  return (
    <div className="border-l border-white/15 pl-4">
      <p className="text-[11px] font-semibold tracking-widest text-white/55 uppercase">{label}</p>
      <div className="num mt-1.5 text-2xl" style={{ color: accent }}>
        {value}
      </div>
      <p className="mt-0.5 text-[11px] text-white/55">{sub}</p>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function Metric({ value, label, tone }: { value: string; label: string; tone?: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className={`num text-2xl ${tone ?? "text-foreground"}`}>{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function SectionTitle({
  eyebrow,
  title,
  hint,
  badge,
  badgeTone,
}: {
  eyebrow: string;
  title: string;
  hint: string;
  badge?: string;
  badgeTone?: "saving" | "opportunity" | "spend";
}) {
  const toneClass =
    badgeTone === "opportunity"
      ? "bg-opportunity-soft text-opportunity"
      : badgeTone === "spend"
        ? "bg-primary-soft text-primary"
        : "bg-saving-soft text-saving";
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="mt-1 text-xl font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
      </div>
      {badge && (
        <span
          className={`rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide uppercase ${toneClass}`}
        >
          {badge}
        </span>
      )}
    </div>
  );
}
