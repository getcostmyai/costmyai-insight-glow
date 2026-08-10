import { Link } from "@tanstack/react-router";
import { ArrowRight, ArrowUpRight, Lock } from "lucide-react";

import {
  HeroStat,
  LevelHero,
  RangeToggle,
  Legend,
  SectionTitle,
} from "@/components/dashboard/primitives";
import { BenchmarkPanel } from "@/components/dashboard/BenchmarkPanel";
import { SavingsRing } from "@/components/dashboard/SavingsRing";
import { UsageSection } from "@/components/dashboard/DashboardShell";
import type { DashboardController } from "@/components/dashboard/useDashboardController";
import { usd } from "@/lib/dashboard-data";
import { LEVELS } from "@/lib/dashboard/levels";
import { captureFigures, levelCount, levelSaving } from "@/lib/dashboard/figures";
import { compact } from "@/lib/gateway-metrics";
import { planAtLeast, type PlanTier } from "@/lib/engine/types";

/**
 * Overview — the only page that is not a level you buy.
 *
 * It answers one question ("where do I stand?") and then hands off: every
 * number on it belongs to a level, and every card links to the level that owns
 * it. No switch is activated from here on purpose — acting happens where the
 * evidence for the switch is shown.
 */
export function OverviewLevel({ ctl }: { ctl: DashboardController }) {
  const { data, range, setRange, activeRange, live, scope } = ctl;
  const { savings, stats, plan } = data;

  // Exact snapshot figures, not the live ticker: this window must read the same
  // here as it does on every level page.
  // Shared with the gateway usage widget below via the controller, so the two
  // spend figures on this page are literally the same number.
  const windowSpend = live.spend;
  // Captured and available are both real sums over the selected window.
  const capture = captureFigures(savings);
  const totalOpportunity = capture.identified;
  const spendDelta =
    data.previous.spend > 0 ? ((windowSpend - data.previous.spend) / data.previous.spend) * 100 : 0;
  const totalTokens = data.totals.inputTokens + data.totals.outputTokens;
  const costPerMillion = totalTokens > 0 ? (windowSpend / totalTokens) * 1_000_000 : 0;

  const forecast = data.projection;

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
      // Dispatch 172. "Refused" now means measured and refused. Workloads no
      // instrument covers are reported as unmeasured, not as failures.
      detail: `${stats.qualityCertified} certified · ${stats.qualityRefusedMeasured ?? stats.qualityRefused} refused${
        (stats.qualityRefusedUnmeasurable ?? 0) > 0
          ? ` · ${stats.qualityRefusedUnmeasurable} not measurable`
          : ""
      }`,
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
      title: "Switches running",
      detail: "Rerouting traffic right now",
      value: data.reroutingCount,
      unit: "switches rerouting",

      tone: "spend" as const,
    },
  ];

  const levelCards = LEVELS.filter((l) => l.key !== "overview").map((meta) => {
    const unlocked = planAtLeast(plan as PlanTier, meta.requiredPlan!);
    if (meta.key === "compare")
      return {
        meta,
        unlocked,
        count: levelCount(data, "host_arbitrage"),
        monthly: levelSaving(data, "host_arbitrage"),
        valueText: null as string | null,
        caption: null as string | null,
      };
    if (meta.key === "certify")
      return {
        meta,
        unlocked,
        count: levelCount(data, "quality_match"),
        monthly: levelSaving(data, "quality_match"),
        valueText: null as string | null,
        caption: null as string | null,
      };
    if (meta.key === "rightsize")
      return {
        meta,
        unlocked,
        count: levelCount(data, "rightsize"),
        monthly: levelSaving(data, "rightsize"),
        valueText: null as string | null,
        caption: null as string | null,
      };
    /**
     * Govern finds nothing of its own — it applies what the three checks above
     * already certified. Counting "opportunities" here would read $0 · 0 by
     * construction, so the card measures what Govern actually did: money it
     * applied unattended, and how many switches it is running right now. When
     * nothing has accrued yet the headline is the honest one — the number of
     * switches it is running — rather than a $0 that reads as broken.
     */
    const gov = data.govern;
    return {
      meta,
      unlocked,
      count: gov.running,
      monthly: gov.captured,
      valueText:
        gov.captured > 0
          ? usd(gov.captured, 0)
          : `${gov.running} switch${gov.running === 1 ? "" : "es"}`,
      caption:
        gov.captured > 0
          ? `applied autonomously · ${gov.running} running unattended · ${activeRange.long}`
          : gov.running > 0
            ? `running unattended · no saving accrued yet · ${activeRange.long}`
            : `nothing running unattended · ${activeRange.long}`,
    };
  });



  return (
    <>
      <LevelHero
        eyebrow={
          <>
            {/* The label follows the connection, never the layout: a pulsing
                "Live" over a workspace that cannot receive events is the exact
                lie the disconnection banner exists to prevent. */}
            <span className="inline-flex items-center gap-2">
              <span
                className={`inline-block size-2 rounded-full ${
                  data.ingest.state === "live"
                    ? "animate-pulse-dot bg-[oklch(0.78_0.18_150)]"
                    : "bg-white/40"
                }`}
              />
              {data.ingest.state === "live"
                ? "Live · streaming from your gateway"
                : data.ingest.state === "disconnected"
                  ? "Disconnected · last received data"
                  : data.ingest.state === "quiet"
                    ? "Paused · no events arriving"
                    : "Not connected yet"}
            </span>
            <span className="hidden text-white/35 sm:inline">|</span>
            <RangeToggle range={range} onChange={setRange} dark />
          </>
        }

        headline={
          <>
            You left{" "}
            <span className="num text-[oklch(0.83_0.11_195)]">{usd(savings.available)}</span>{" "}
            <span className="text-white/80">on the table in the {activeRange.long}.</span>
          </>
        }
        sub={
          <>
            Across every check your workspace runs, {savings.certifiedCount} switch
            {savings.certifiedCount === 1 ? " is" : "es are"} certified and ready to activate,
            measured as a real sum over the {activeRange.long} of your own traffic, each workload
            counted once.
            {savings.locked > 0 && (
              <>
                {" "}
                A further <span className="num text-white">
                  {usd(savings.locked, 0)}
                </span>{" "}
                was found by checks your plan does not include yet.
              </>
            )}
          </>
        }
        stats={
          <>
            <HeroStat
              label={`Spend · ${activeRange.long}`}
              value={usd(windowSpend)}
              sub={
                <span className="text-white/70">
                  {spendDelta >= 0 ? "▲" : "▼"} {Math.abs(spendDelta).toFixed(1)}% vs previous
                </span>
              }
              accent="oklch(0.85 0.1 300)"
            />
            <HeroStat
              /* One short label. The qualifier lives in the subtext: appending
                 "· range" / "· unavailable" made the label longer than its
                 column at every width, so it clipped even on a 27" screen. */
              label="Projected month-end"
              value={
                forecast.suppressed || forecast.monthEndUsd === null
                  ? "—"
                  : forecast.isRange && forecast.lowUsd !== null && forecast.highUsd !== null
                    ? `${usd(forecast.lowUsd, 0)}–${usd(forecast.highUsd, 0)}`
                    : usd(forecast.monthEndUsd, 0)
              }
              sub={
                forecast.suppressed
                  ? `Unavailable — ${forecast.suppressionReason ?? "not enough data to project"}`
                  : forecast.isRange
                    ? `Range — ${forecast.reasons[0] ?? "the data does not support a single number"}`
                    : forecast.reasons.length > 0
                      ? forecast.reasons[0]
                      : `${usd(forecast.mtdUsd, 0)} so far + ${forecast.remainingDays} day${forecast.remainingDays === 1 ? "" : "s"} at your 7-day rate`
              }
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
              value={`${capture.pct}%`}
              sub={`${usd(savings.captured, 0)} of ${usd(totalOpportunity, 0)} identified · ${activeRange.long}`}
              accent="oklch(0.82 0.16 155)"
            />
            <HeroStat
              label="Running unattended"
              value={`${data.govern.running} switch${data.govern.running === 1 ? "" : "es"}`}
              sub={
                data.govern.unlocked && data.govern.enabled
                  ? "autonomous switching is on"
                  : "Govern is not applying switches"
              }
              accent="oklch(0.86 0.09 265)"
            />
          </>
        }
        aside={
          <>
            <SavingsRing captured={savings.captured} available={savings.available} period={activeRange.long} />
            <div className="mt-4 flex justify-center gap-5 text-xs text-white/70">
              <Legend color="oklch(0.65 0.15 158)" label="Captured" />
              <Legend color="oklch(0.72 0.11 195)" label="Available" />
            </div>
          </>
        }
      />

      {scope === "mine" ? <BenchmarkPanel /> : null}

      <UsageSection ctl={ctl} />

      <section>
        <SectionTitle
          eyebrow="Your levels"
          title="Where the money is, level by level"
          hint="Each level is its own page, with its own evidence. Locked levels still show what they found."
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {levelCards.map(({ meta, unlocked, count, monthly, valueText, caption }) => (
            <Link
              key={meta.key}
              to={
                scope === "demo"
                  ? DEMO_PATHS[meta.key as keyof typeof DEMO_PATHS]
                  : MINE_PATHS[meta.key as keyof typeof MINE_PATHS]
              }
              className="card-surface group flex flex-col p-5 transition-transform hover:-translate-y-0.5"
            >
              <div className="flex items-center justify-between">
                <p className="eyebrow">{meta.label}</p>
                {unlocked ? null : <Lock className="size-3.5 text-muted-foreground" />}
              </div>
              <span
                className={`num mt-2 text-3xl ${unlocked ? "text-saving" : "text-muted-foreground"}`}
              >
                {valueText ?? usd(monthly, 0)}
              </span>
              <p className="mt-1 text-xs text-muted-foreground">
                {caption ??
                  `${count} ${count === 1 ? "opportunity" : "opportunities"} · ${activeRange.long}`}
              </p>

              <p className="mt-3 text-sm text-muted-foreground">{meta.tagline}</p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                {unlocked
                  ? "Open"
                  : meta.key === "govern"
                    ? "See what it would run"
                    : "See what it found"}
                <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle
          eyebrow="How your savings were found"
          title="Four checks, run against your live traffic"
          hint="Nothing is recommended until the check that would refuse it has run."
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

      {data.reconciliation.length > 0 && (
        <section>
          <SectionTitle
            eyebrow="Verified against your invoice"
            title="Estimated versus invoiced"
            hint="Your provider's own billing total, checked against what our metadata said it should cost."
            badge={`${data.reconciliation.filter((r) => r.verdict === "match").length}/${data.reconciliation.length} within tolerance`}
            badgeTone="saving"
          />
          <div className="card-surface divide-y divide-border overflow-hidden">
            {data.reconciliation.map((r) => (
              <div
                key={`${r.provider}-${r.periodStart}`}
                className="flex flex-wrap items-center gap-x-6 gap-y-2 p-5"
              >
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

      {data.reconciliation.length === 0 && data.reconciliationOutsideWindow > 0 && (
        <p className="text-center text-xs text-muted-foreground">
          No provider billing period closed entirely inside the {activeRange.long} ·{" "}
          {data.reconciliationOutsideWindow} reconciled period
          {data.reconciliationOutsideWindow === 1 ? "" : "s"} sit outside this window.
        </p>
      )}

      <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        Each level page shows the evidence behind its own number
        <ArrowRight className="size-3" />
      </p>
    </>
  );
}

const DEMO_PATHS = {
  compare: "/demo/compare",
  certify: "/demo/certify",
  rightsize: "/demo/rightsize",
  govern: "/demo/govern",
} as const;

const MINE_PATHS = {
  compare: "/workspace/compare",
  certify: "/workspace/certify",
  rightsize: "/workspace/rightsize",
  govern: "/workspace/govern",
} as const;
