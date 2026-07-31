import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  PlugZap,
  ArrowUpRight,
  BadgeCheck,
  Gauge,
  Layers,
  LineChart,
  Loader2,
  Pause,
  Play,
  Undo2,
  Scale,
  Settings,
  ShieldCheck,
  Snowflake,
  Sparkle,
  TrendingDown,
  Zap,
} from "lucide-react";
import { SavingsRing } from "@/components/dashboard/SavingsRing";
import { SpendChart, type ChartMetric } from "@/components/dashboard/SpendChart";
import { SwitchCard } from "@/components/dashboard/SwitchCard";
import { ObjectiveSelect, RungEmpty, RungLocked } from "@/components/dashboard/RungState";
import { dashboardQuery, ranges, rangeFor, type RangeKey, type DashboardScope } from "@/lib/dashboard-queries";
import type { ObjectiveKind } from "@/lib/engine/types";
import type { SwitchOpportunity } from "@/lib/dashboard.server";
import { compact, int, rangeHours, useLiveTotals } from "@/lib/gateway-metrics";
import { useSessionUser } from "@/hooks/use-session-user";
import { supabase } from "@/integrations/supabase/client";
import { usd, type SwitchRow } from "@/lib/dashboard-data";
import {
  activateOpportunity,
  pauseSwitch,
  resumeSwitch,
  rollbackSwitch,
  setObjective as setObjectiveFn,
  type OpportunityKind,
} from "@/lib/switches.functions";

const navItems = [
  { label: "Overview", icon: Layers },
  { label: "Compare", icon: LineChart },
  { label: "Certify", icon: BadgeCheck },
  { label: "Rightsize", icon: Gauge, active: true },
  { label: "Govern", icon: ShieldCheck, href: "#govern" },
];

const topNav = ["Analyzer", "Calculators", "Models", "Intelligence", "Blog", "Plans"];

const asSwitchRow = (o: SwitchOpportunity, kind: SwitchRow["kind"]): SwitchRow => ({
  fromModel: o.fromModel,
  fromHost: o.fromHostLabel || o.fromHost,
  toModel: o.toModel,
  toHost: o.toHostLabel || o.toHost,
  fromHostKey: o.fromHost,
  toHostKey: o.toHost,
  taskHint: o.taskHint,
  kind,
  monthlySaving: o.monthlySaving,
  savingPct: o.savingPct,
  basis: o.basis,
  note: o.note,
  qualityDelta: o.qualityDelta,
});

/**
 * The dashboard, rendered for either workspace scope.
 *
 * "demo" is the public synthetic workspace anyone can look at; "mine" is the
 * signed-in user's own workspace, read through their session. The view is
 * identical because the numbers come from the same engine — only the source
 * workspace differs.
 */
export function DashboardView({ scope = "demo" }: { scope?: DashboardScope }) {
  const [range, setRange] = useState<RangeKey>("30d");
  const [metric, setMetric] = useState<ChartMetric>("spend");
  const [objective, setObjective] = useState<ObjectiveKind>("cost");
  const { data } = useSuspenseQuery(dashboardQuery(range, objective, scope));
  const session = useSessionUser();
  const queryClient = useQueryClient();
  /** The demo workspace is read-only by design; only "mine" gets live controls. */
  const canAct = scope === "mine";
  const [actionError, setActionError] = useState<{ key: string; message: string } | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  const asMessage = (e: unknown) =>
    e instanceof Error ? e.message : "That action could not be completed.";

  const activate = useMutation({
    mutationFn: (v: {
      key: string;
      kind: OpportunityKind;
      fromModel: string;
      fromHost: string;
      toModel: string;
      toHost: string;
      taskHint: string;
    }) =>
      activateOpportunity({
        data: {
          orgId: data.workspace.id,
          kind: v.kind,
          fromModel: v.fromModel,
          fromHost: v.fromHost,
          toModel: v.toModel,
          toHost: v.toHost,
          taskHint: v.taskHint,
        },
      }),
    onSuccess: async () => {
      setActionError(null);
      await refresh();
    },
    onError: (e, v) => setActionError({ key: v.key, message: asMessage(e) }),
  });

  const lifecycle = useMutation({
    mutationFn: (v: { key: string; switchId: string; action: "pause" | "resume" | "rollback" }) => {
      const payload = { data: { orgId: data.workspace.id, switchId: v.switchId } };
      if (v.action === "pause") return pauseSwitch(payload);
      if (v.action === "resume") return resumeSwitch(payload);
      return rollbackSwitch(payload);
    },
    onSuccess: async () => {
      setActionError(null);
      await refresh();
    },
    onError: (e, v) => setActionError({ key: v.key, message: asMessage(e) }),
  });

  const objectiveMutation = useMutation({
    mutationFn: (v: ObjectiveKind) =>
      setObjectiveFn({ data: { orgId: data.workspace.id, objective: v } }),
    onSuccess: async () => {
      setActionError(null);
      await refresh();
    },
    onError: (e) => setActionError({ key: "objective", message: asMessage(e) }),
  });

  const chooseObjective = (v: ObjectiveKind) => {
    setObjective(v);
    // On your own workspace the choice is persisted (Certify); on the demo it is
    // a local preview of what that objective would recommend.
    if (canAct) objectiveMutation.mutate(v);
  };

  const rsKey = (o: { model: string; hostKey: string; task: string }) =>
    `rightsize:${o.model}|${o.hostKey}|${o.task}`;

  const errorFor = (key: string) => (actionError?.key === key ? actionError.message : null);
  const busy = (key: string) =>
    (activate.isPending && activate.variables?.key === key) ||
    (lifecycle.isPending && lifecycle.variables?.key === key);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.assign("/auth");
  }


  const { series, live } = useLiveTotals(range, data.series, data.totals, data.generatedAt);
  const activeRange = rangeFor(range);

  const { savings, stats, coverage, activeSwitches, reconciliation, rungs, dataState, plan } = data;
  const waiting = dataState !== "ready";
  const totalOpportunity = savings.activeMonthly + savings.availableMonthly;
  const captureRate = totalOpportunity > 0 ? savings.activeMonthly / totalOpportunity : 0;
  const spendDelta =
    data.previous.spend > 0 ? ((live.spend - data.previous.spend) / data.previous.spend) * 100 : 0;
  const runRateMonthly = (live.spend / rangeHours(range)) * 720;
  const totalTokens = live.inputTokens + live.outputTokens;
  const costPerMillion = totalTokens > 0 ? (live.spend / totalTokens) * 1_000_000 : 0;

  const pipelineSteps = [
    {
      step: 1,
      title: "Host Arbitrage Check",
      detail: "Same model weights, cheaper provider",
      value: stats.hostCertified,
      unit: "workloads certified",
      tone: "saving" as const,
    },
    {
      step: 2,
      title: "Quality Check",
      detail: `${stats.qualityCertified} certified · ${stats.qualityRefused} refused`,
      value: stats.qualityEvaluated,
      unit: "workloads evaluated",
      tone: "saving" as const,
    },
    {
      step: 3,
      title: "Right-Size Check",
      detail: "Premium models on low-complexity tasks",
      value: stats.oversizedFlagged,
      unit: "workloads flagged",
      tone: "opportunity" as const,
    },
    {
      step: 4,
      title: "Manual Switch",
      detail: "Rerouting traffic right now",
      value: activeSwitches.length,
      unit: "active switches",
      tone: "spend" as const,
    },
  ];

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
          <div className="ml-auto flex items-center gap-4">
            {/* Session-driven, never route-driven: after an OAuth callback the
                session arrives asynchronously and this must follow it. */}
            {session.ready && session.signedIn ? (
              <>
                <span className="hidden max-w-[180px] truncate text-sm text-muted-foreground sm:block">
                  {session.email}
                </span>
                <button
                  type="button"
                  onClick={signOut}
                  className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
                >
                  Sign out
                </button>
              </>
            ) : session.ready ? (
              <a
                href="/auth"
                className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
              >
                Sign in
              </a>
            ) : null}
            <a
              href={session.ready && session.signedIn ? "/workspace" : "/auth"}
              className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-transform hover:scale-[1.02] active:scale-95"
            >
              {session.ready && session.signedIn
                ? scope === "demo"
                  ? "Go to my workspace"
                  : "Connect a gateway"
                : "See if you're overpaying"}
            </a>
          </div>

        </div>
      </header>

      <div className="mx-auto flex max-w-[1440px] gap-8 px-5 py-8 lg:px-8">
        {/* Sidebar */}
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-24 space-y-6">
            <div>
              <p className="text-sm font-semibold">{data.workspace.name}</p>
              <span className="mt-2 inline-flex rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold tracking-widest text-primary-foreground uppercase">
                {data.workspace.plan}
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
          {dataState === "awaiting_first_event" && (
            <section className="flex flex-wrap items-center gap-5 rounded-2xl border border-dashed border-primary/35 bg-primary-soft/50 p-6">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <PlugZap className="size-5" />
              </span>
              <div className="min-w-60 flex-1">
                <p className="text-sm font-semibold text-primary">Waiting for your first event</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Nothing has been ingested for this workspace yet, so no check has run. Point your
                  gateway at CostMyAI — we backfill the previous 30 days on connect, so the first
                  view is a full month of history, not an empty chart.
                </p>
              </div>
              <button className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)]">
                Connect your gateway
              </button>
            </section>
          )}

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
                <div className="flex flex-wrap items-center gap-3 text-xs text-white/70">
                  <span className="inline-flex items-center gap-2">
                    <span className="animate-pulse-dot inline-block size-2 rounded-full bg-[oklch(0.78_0.18_150)]" />
                    Live · streaming from your gateway
                  </span>
                  <span className="hidden text-white/35 sm:inline">|</span>
                  <RangeToggle range={range} onChange={setRange} dark />
                </div>
                <h1 className="mt-4 text-3xl leading-tight font-semibold sm:text-[2.6rem]">
                  You can stop paying{" "}
                  <span className="num text-[oklch(0.83_0.11_195)]">
                    {usd(savings.availableMonthly)}
                  </span>{" "}
                  <span className="text-white/80">a month — today.</span>
                </h1>
                <p className="mt-3 max-w-xl text-sm text-white/70">
                  {savings.certifiedCount} certified switches are waiting on your {plan} plan. Every
                  one is quality-checked against your own traffic — same output, lower bill.
                  {savings.lockedMonthly > 0 && (
                    <>
                      {" "}
                      A further{" "}
                      <span className="num text-white">{usd(savings.lockedMonthly, 0)}/mo</span> was
                      found by checks your plan does not include yet.
                    </>
                  )}
                </p>

                <div className="mt-8 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
                  <HeroStat
                    label={`Spend · ${activeRange.long}`}
                    value={usd(live.spend)}
                    sub={
                      <span className="text-white/70">
                        {spendDelta >= 0 ? "▲" : "▼"} {Math.abs(spendDelta).toFixed(1)}% vs previous
                      </span>
                    }
                    accent="oklch(0.85 0.1 300)"
                  />
                  <HeroStat
                    label="Projected month-end"
                    value={usd(runRateMonthly, 0)}
                    sub={`${usd(Math.max(0, runRateMonthly - savings.availableMonthly), 0)} if all switches run`}
                    accent="oklch(0.9 0.03 285)"
                  />
                  <HeroStat
                    label="Blended cost / 1M tok"
                    value={usd(costPerMillion)}
                    sub={`${compact(totalTokens)} tokens processed`}
                    accent="oklch(0.83 0.11 195)"
                  />
                  <HeroStat
                    label="Savings captured"
                    value={`${Math.round(captureRate * 100)}%`}
                    sub={`${usd(savings.activeMonthly, 0)} of ${usd(totalOpportunity, 0)} identified`}
                    accent="oklch(0.82 0.16 155)"
                  />
                </div>

                <button className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-[oklch(0.22_0.07_285)] transition-transform hover:scale-[1.02] active:scale-95">
                  Activate all certified switches
                  <ArrowRight className="size-4" />
                </button>
              </div>

              <div className="lg:pl-6">
                <SavingsRing
                  captured={savings.activeMonthly}
                  available={savings.availableMonthly}
                />
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
                <p className="eyebrow">Gateway usage · {activeRange.long}</p>
                <div className="mt-3 flex flex-wrap items-baseline gap-x-8 gap-y-2">
                  <Metric value={usd(live.spend)} label="spend" tone="text-spend" live />
                  <Metric value={int(live.requests)} label="requests" live />
                  <Metric value={compact(live.inputTokens)} label="input tok" live />
                  <Metric value={compact(live.outputTokens)} label="output tok" live />
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <RangeToggle range={range} onChange={setRange} />
                <div className="flex gap-1 rounded-full bg-muted p-1 text-xs font-medium">
                  {(
                    [
                      ["spend", "Spend"],
                      ["requests", "Requests"],
                      ["tokens", "Tokens"],
                    ] as [ChartMetric, string][]
                  ).map(([key, t]) => (
                    <button
                      key={key}
                      onClick={() => setMetric(key)}
                      className={`rounded-full px-3 py-1.5 transition-colors ${
                        metric === key
                          ? "bg-card text-primary shadow-[var(--shadow-card)]"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-6">
              <SpendChart series={series} metric={metric} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {coverage.untrackedModels > 0
                ? `${coverage.untrackedModels} model${coverage.untrackedModels === 1 ? "" : "s"} excluded from the spend total — no pricing data available. `
                : "Every model in this window has live pricing coverage. "}
              Prices verified {coverage.pricesSyncedAgo}.
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
              {pipelineSteps.map((p) => (
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
              badge={`${data.hostArbitrage.length} certified`}
              badgeTone="saving"
            />
            {!rungs.host_arbitrage.unlocked ? (
              <RungLocked
                requiredPlan={rungs.host_arbitrage.requiredPlan}
                count={rungs.host_arbitrage.lockedCount}
                monthly={rungs.host_arbitrage.lockedMonthly}
                what="cheaper-host"
              />
            ) : data.hostArbitrage.length === 0 ? (
              <RungEmpty state={dataState} kind="host_arbitrage" />
            ) : (
              <div className="space-y-3">
                {data.hostArbitrage.map((row, i) => {
                  const key = `host:${row.fromModel}|${row.fromHost}|${row.toHost}|${row.taskHint}`;
                  return (
                    <SwitchCard
                      key={key}
                      row={asSwitchRow(row, "host")}
                      rank={i + 1}
                      pending={busy(key)}
                      error={errorFor(key)}
                      onActivate={
                        canAct
                          ? () =>
                              activate.mutate({
                                key,
                                kind: "host_arbitrage",
                                fromModel: row.fromModel,
                                fromHost: row.fromHost,
                                toModel: row.toModel,
                                toHost: row.toHost,
                                taskHint: row.taskHint,
                              })
                          : undefined
                      }
                    />
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <SectionTitle
              eyebrow="Quality-matched"
              title="Cheaper model, same measured quality"
              hint={`Benchmarked against ${coverage.evaluations} measured evaluation bands before we recommend the swap.`}
              badge={`${data.qualityMatched.length} certified`}
              badgeTone="saving"
              aside={
                <ObjectiveSelect
                  value={objective}
                  onChange={chooseObjective}
                  locked={!rungs.quality_match.unlocked}
                  requiredPlan={rungs.quality_match.requiredPlan}
                />
              }
            />
            {!rungs.quality_match.unlocked ? (
              <RungLocked
                requiredPlan={rungs.quality_match.requiredPlan}
                count={rungs.quality_match.lockedCount}
                monthly={rungs.quality_match.lockedMonthly}
                what="quality-matched"
              />
            ) : data.qualityMatched.length === 0 ? (
              <RungEmpty state={dataState} kind="quality_match" />
            ) : (
              <div className="space-y-3">
                {data.qualityMatched.map((row, i) => {
                  const key = `quality:${row.fromModel}|${row.toModel}|${row.taskHint}`;
                  return (
                    <SwitchCard
                      key={key}
                      row={asSwitchRow(row, "quality")}
                      rank={i + 1}
                      pending={busy(key)}
                      error={errorFor(key)}
                      onActivate={
                        canAct
                          ? () =>
                              activate.mutate({
                                key,
                                kind: "quality_match",
                                fromModel: row.fromModel,
                                fromHost: row.fromHost,
                                toModel: row.toModel,
                                toHost: row.toHost,
                                taskHint: row.taskHint,
                              })
                          : undefined
                      }
                    />
                  );
                })}
              </div>
            )}
          </section>

          {/* 5 — Waste */}
          <section>
            <SectionTitle
              eyebrow="Attention needed"
              title="Overpowered for the task"
              hint="Frontier-tier models running work an economy tier handles."
              badge={`${data.oversized.length} workloads`}
              badgeTone="opportunity"
            />
            {!rungs.rightsize.unlocked ? (
              <RungLocked
                requiredPlan={rungs.rightsize.requiredPlan}
                count={rungs.rightsize.lockedCount}
                monthly={rungs.rightsize.lockedMonthly}
                what="oversized-workload"
              />
            ) : data.oversized.length === 0 ? (
              <RungEmpty state={dataState} kind="rightsize" />
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {data.oversized.map((o) => (
                  <div
                    key={`${o.model}-${o.host}-${o.task}`}
                    className="rounded-2xl border border-opportunity/25 bg-opportunity-soft p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="font-mono text-base font-semibold">{o.model}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{o.host}</span>
                      </div>
                      <span className="rounded-full bg-opportunity px-2.5 py-1 text-[10px] font-bold tracking-wider text-white uppercase">
                        {o.task}
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
                    {o.toModel ? (
                      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-opportunity/20 pt-3">
                        <span className="text-xs text-muted-foreground">
                          Right-size to{" "}
                          <span className="font-mono text-foreground">{o.toModel}</span>
                        </span>
                        {canAct ? (
                          <button
                            type="button"
                            disabled={busy(rsKey(o))}
                            onClick={() =>
                              activate.mutate({
                                key: rsKey(o),
                                kind: "rightsize",
                                fromModel: o.model,
                                fromHost: o.hostKey,
                                toModel: o.toModel!,
                                toHost: o.hostKey,
                                taskHint: o.task,
                              })
                            }
                            className="ml-auto inline-flex items-center gap-2 rounded-full bg-opportunity px-3.5 py-1.5 text-xs font-semibold text-white transition-transform active:scale-95 disabled:opacity-60"
                          >
                            {busy(rsKey(o)) ? <Loader2 className="size-3.5 animate-spin" /> : null}
                            Right-size now
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                    {errorFor(rsKey(o)) ? (
                      <p className="mt-2 text-xs text-destructive">{errorFor(rsKey(o))}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 6 — Proof: what's already running */}
          <section>
            <SectionTitle
              eyebrow="Working for you right now"
              title="Active switches"
              hint={`Activated in the ${activeRange.long}, ranked by amount saved.${
                data.switchesOutsideWindow > 0
                  ? ` ${data.switchesOutsideWindow} more started before this window.`
                  : ""
              }`}
              badge={`${activeSwitches.length} in window`}
              badgeTone="spend"
            />
            <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
              <div className="space-y-3">
                {activeSwitches.length === 0 ? (
                  <EmptyState
                    text={
                      waiting
                        ? dataState === "awaiting_first_event"
                          ? "No switch can run until your first event lands. Connect your gateway and the meter starts here."
                          : "No switch was activated inside this window. Widen the range to see earlier activations."
                        : data.switchesOutsideWindow > 0
                          ? `No switch was activated in the ${activeRange.long}. ${data.switchesOutsideWindow} started earlier and are still rerouting traffic.`
                          : "Nothing rerouted yet. Activating a certified switch starts the meter here."
                    }
                  />
                ) : (
                  activeSwitches.map((s) => (
                    <div key={`${s.fromModel}-${s.toHost}`} className="card-surface p-5">
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
                        <span className="text-xs text-muted-foreground">
                          Saved since activation · {usd(s.monthlyRate, 0)}/mo run-rate
                        </span>
                        <span className="num text-lg text-saving">+{usd(s.saved)}</span>
                      </div>
                      <SwitchControls
                        state="active"
                        busy={busy(`switch:${s.switchId}`)}
                        error={errorFor(`switch:${s.switchId}`)}
                        canAct={canAct}
                        onAction={(action) =>
                          lifecycle.mutate({
                            key: `switch:${s.switchId}`,
                            switchId: s.switchId,
                            action,
                          })
                        }
                      />
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-4">
                <div className="card-surface flex items-center gap-4 p-5">
                  <div className="flex size-11 items-center justify-center rounded-2xl bg-frozen-soft">
                    <Snowflake className="size-5 text-frozen" />
                  </div>
                  <div>
                    <div className="num text-3xl text-frozen">{data.frozen}</div>
                    <p className="text-xs text-muted-foreground">
                      frozen switches · {data.frozen === 0 ? "all healthy" : "review needed"}
                    </p>
                  </div>
                </div>

                {data.frozenSwitches.map((s) => (
                  <div key={s.switchId} className="card-surface p-5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-mono text-sm text-muted-foreground">{s.fromModel}</span>
                      <ArrowRight className="size-3.5 text-frozen" />
                      <span className="font-mono text-sm font-semibold">{s.toModel}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Paused · {s.toHost} · since {s.since}
                    </p>
                    <SwitchControls
                      state="paused"
                      busy={busy(`switch:${s.switchId}`)}
                      error={errorFor(`switch:${s.switchId}`)}
                      canAct={canAct}
                      onAction={(action) =>
                        lifecycle.mutate({
                          key: `switch:${s.switchId}`,
                          switchId: s.switchId,
                          action,
                        })
                      }
                    />
                  </div>
                ))}

                <div
                  id="govern"
                  className="relative overflow-hidden rounded-2xl border border-saving/20 bg-saving-soft p-5"
                >
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

          {/* 7 — Trust: estimate vs the real invoice */}
          {reconciliation.length === 0 && data.reconciliationOutsideWindow > 0 && (
            <p className="text-center text-xs text-muted-foreground">
              No provider billing period closed entirely inside the {activeRange.long} ·{" "}
              {data.reconciliationOutsideWindow} reconciled period
              {data.reconciliationOutsideWindow === 1 ? "" : "s"} sit outside this window.
            </p>
          )}

          {reconciliation.length > 0 && (
            <section>
              <SectionTitle
                eyebrow="Verified against your invoice"
                title="Estimated versus invoiced"
                hint="Your provider's own billing total, checked against what our metadata said it should cost."
                badge={`${reconciliation.filter((r) => r.verdict === "match").length}/${reconciliation.length} within tolerance`}
                badgeTone="saving"
              />
              <div className="card-surface divide-y divide-border overflow-hidden">
                {reconciliation.map((r) => (
                  <div
                    key={`${r.provider}-${r.periodStart}`}
                    className="flex flex-wrap items-center gap-x-6 gap-y-2 p-5"
                  >
                    <Scale className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-32">
                      <p className="text-sm font-semibold capitalize">{r.provider}</p>
                      <p className="num text-[11px] text-muted-foreground">
                        {r.periodStart} → {r.periodEnd}
                      </p>
                    </div>
                    <div>
                      <p className="eyebrow">Estimated</p>
                      <p className="num text-base">{usd(r.estimatedUsd)}</p>
                    </div>
                    <div>
                      <p className="eyebrow">Invoiced</p>
                      <p className="num text-base">{usd(r.invoicedUsd)}</p>
                    </div>
                    <span
                      className={`num ml-auto rounded-full px-3 py-1 text-xs font-semibold ${
                        r.verdict === "match"
                          ? "bg-saving-soft text-saving"
                          : "bg-opportunity-soft text-opportunity"
                      }`}
                    >
                      {r.deltaPct >= 0 ? "+" : ""}
                      {r.deltaPct.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <p className="pb-6 text-center text-xs text-muted-foreground">
            Savings computed from your tracked traffic and current provider pricing · last read{" "}
            <LocalTime iso={data.generatedAt} />.
          </p>
        </main>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="card-surface p-6 text-sm text-muted-foreground">{text}</div>
  );
}

function RangeToggle({
  range,
  onChange,
  dark,
}: {
  range: RangeKey;
  onChange: (r: RangeKey) => void;
  dark?: boolean;
}) {
  return (
    <div
      className={`inline-flex gap-1 rounded-full p-1 text-xs font-medium ${
        dark ? "bg-white/10" : "bg-muted"
      }`}
    >
      {ranges.map((r) => {
        const on = r.key === range;
        return (
          <button
            key={r.key}
            onClick={() => onChange(r.key)}
            aria-pressed={on}
            className={`rounded-full px-3 py-1 transition-colors ${
              on
                ? dark
                  ? "bg-white/90 text-[oklch(0.22_0.07_285)]"
                  : "bg-card text-primary shadow-[var(--shadow-card)]"
                : dark
                  ? "text-white/70 hover:text-white"
                  : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {r.label}
          </button>
        );
      })}
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
  sub: React.ReactNode;
  accent: string;
}) {
  return (
    <div className="border-l border-white/15 pl-4">
      <p className="text-[11px] font-semibold tracking-widest text-white/55 uppercase">{label}</p>
      <div
        className="num mt-1.5 text-2xl tabular-nums"
        style={{ color: accent, fontVariantNumeric: "tabular-nums" }}
      >
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

function Metric({
  value,
  label,
  tone,
  live,
}: {
  value: string;
  label: string;
  tone?: string;
  live?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span
        className={`num text-2xl ${tone ?? "text-foreground"}`}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </span>
      <span className="flex items-baseline gap-1 text-xs text-muted-foreground">
        {label}
        {live && (
          <span className="animate-pulse-dot inline-block size-1.5 rounded-full bg-saving" />
        )}
      </span>
    </div>
  );
}

function SectionTitle({
  eyebrow,
  title,
  hint,
  badge,
  badgeTone,
  aside,
}: {
  eyebrow: string;
  title: string;
  hint: string;
  badge?: string;
  badgeTone?: "saving" | "opportunity" | "spend";
  aside?: React.ReactNode;
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
      <div className="flex flex-wrap items-end gap-4">
        {aside}
        {badge && (
          <span
            className={`rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide uppercase ${toneClass}`}
          >
            {badge}
          </span>
        )}
      </div>
    </div>
  );
}

/** Server and browser time zones differ, so the clock is rendered after hydration. */
function LocalTime({ iso }: { iso: string }) {
  const [text, setText] = useState("");
  useEffect(() => setText(new Date(iso).toLocaleTimeString("en-US")), [iso]);
  return <span suppressHydrationWarning>{text}</span>;
}

/**
 * Lifecycle controls for one switch. Pause is reversible, rollback is terminal —
 * the labels say so, because the database will not undo it.
 */
function SwitchControls({
  state,
  busy,
  error,
  canAct,
  onAction,
}: {
  state: "active" | "paused";
  busy: boolean;
  error: string | null;
  canAct: boolean;
  onAction: (action: "pause" | "resume" | "rollback") => void;
}) {
  if (!canAct) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {state === "active" ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => onAction("pause")}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
        >
          <Pause className="size-3.5" />
          Pause
        </button>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => onAction("resume")}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
        >
          <Play className="size-3.5" />
          Resume
        </button>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (window.confirm("Roll this switch back for good? Traffic returns to the original model and the switch cannot be resumed.")) {
            onAction("rollback");
          }
        }}
        className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-destructive disabled:opacity-60"
      >
        <Undo2 className="size-3.5" />
        Roll back
      </button>
      {busy ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
