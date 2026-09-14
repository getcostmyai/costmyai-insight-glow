import { ArrowRight, Clock, ShieldOff } from "lucide-react";

import { HeroStat, SectionTitle, asSwitchRow } from "@/components/dashboard/primitives";
import { OpportunityRing } from "@/components/dashboard/SavingsRing";

import { WorkloadAlternatives } from "@/components/dashboard/WorkloadAlternatives";
import { groupFor } from "@/lib/dashboard/group";
import { supersededOption } from "@/components/dashboard/SupersededNote";
import { certificationRate, levelCount, levelSaving } from "@/lib/dashboard/figures";
import { SwitchCard } from "@/components/dashboard/SwitchCard";
import { LevelEmpty, LevelLocked } from "@/components/dashboard/LevelState";
import type { DashboardController } from "@/components/dashboard/useDashboardController";

import { usd } from "@/lib/dashboard-data";
import { nonQualifyingEmptyCopy } from "@/lib/dashboard/zero-data-copy";


/**
 * Full transparency: everything the engine looked at, in three lists.
 *
 * A — saved by moving host, same model.
 * B — saved by moving model, quality proven first.
 * C — evaluated and refused, each with the certification engine's own verdict.
 *
 * List C is not a disclaimer. It is the evidence that A and B mean something,
 * which is why it renders the engine's verdict code verbatim rather than one
 * generic "we could not certify this" line.
 */
export function TransparencyLists({ ctl }: { ctl: DashboardController }) {
  return (
    <>
      {/* Dispatch 232. The folded Compare figures ride inside ArbitrageList. */}

      {/**
       * Dispatch 221. Rightsize and Govern render the full transparency lists.
       * Locked alternatives are unreachable there today, but if a future plan
       * gates a mechanism above Rightsize we must not hard-link back to
       * Rightsize (self-link on Rightsize, backward link on Govern). Suppress
       * the href so locked teasers render as plain disclosure, not a route.
       */}
      <ArbitrageList ctl={ctl} upsellHref={null} />
      <BenchmarkList ctl={ctl} upsellHref={null} />
      <NonQualifyingList ctl={ctl} />
    </>
  );
}

/**
 * The Compare hero's five figures, in a compact strip.
 *
 * Computed exactly as CompareLevel computes them: count and money from the
 * shared figures path (so a locked level still states its real numbers),
 * best-single-saving from the findings array, coverage from measured window
 * spend — never the live ticker, whose forward accrual would drift the ratio.
 */
export interface ListStat {
  label: string;
  value: string;
  sub: string;
  accent: string;
}

/**
 * The one summary panel a transparency list sits under.
 *
 * Compare's cheaper-host strip and Certify's benchmark strip are the same
 * object with different figures, so they share this shell: same gradient, same
 * four-stat grid, same ring on the right. A second copy would drift.
 */
export function ListStatsPanel({
  eyebrow,
  stats,
  ringSaving,
  ringSpend,
  ringLabel,
  period,
}: {
  eyebrow: string;
  stats: ListStat[];
  ringSaving: number;
  ringSpend: number;
  ringLabel: string;
  period: string;
}) {
  return (
    <div
      className="mb-6 grid gap-6 rounded-3xl p-6 text-white lg:grid-cols-[1fr_auto] lg:items-center"
      style={{ background: "var(--gradient-hero)" }}
    >
      <div>
        <p className="eyebrow text-white/60">{eyebrow}</p>
        <div className="mt-4 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((s) => (
            <HeroStat key={s.label} label={s.label} value={s.value} sub={s.sub} accent={s.accent} />
          ))}
        </div>
      </div>
      <div className="lg:w-[260px]">
        <OpportunityRing
          saving={ringSaving}
          spend={ringSpend}
          period={period}
          label={ringLabel}
        />
      </div>
    </div>
  );
}

export function ArbitrageStats({ ctl }: { ctl: DashboardController }) {
  const { data, activeRange } = ctl;
  const all = data.hostArbitrage;
  const found = levelCount(data, "host_arbitrage");
  const available = levelSaving(data, "host_arbitrage");
  const measuredSpend = data.totals.spend;
  const bestPct = all.length > 0 ? Math.max(...all.map((r) => r.savingPct)) : 0;
  const onCheapestHost = Math.max(0, measuredSpend - available);
  const coveragePct = measuredSpend > 0 ? (onCheapestHost / measuredSpend) * 100 : null;

  return (
    <ListStatsPanel
      eyebrow={`Cheaper-host check · ${activeRange.long}`}
      period={activeRange.long}
      ringSaving={available}
      ringSpend={measuredSpend}
      ringLabel="Cheaper hosts"
      stats={[
        {
          label: "Cheaper hosts identified",
          value: `${found}`,
          sub: "identical weights, zero quality risk",
          accent: "oklch(0.83 0.11 195)",
        },
        {
          label: `Available · ${activeRange.long}`,
          value: usd(available, 0),
          sub: "what moving to those hosts would have saved",
          accent: "oklch(0.82 0.16 155)",
        },
        {
          label: "Best single saving",
          value: bestPct > 0 ? `${bestPct.toFixed(0)}%` : "—",
          sub: bestPct > 0 ? "on one workload's host swap" : "nothing left to move",
          accent: "oklch(0.86 0.09 265)",
        },
        {
          label: "On cheapest host",
          value: coveragePct === null ? "—" : `${Math.round(coveragePct)}%`,
          sub:
            coveragePct === null
              ? "not enough priced traffic yet to judge"
              : "of your spend already optimal",
          accent: "oklch(0.9 0.03 285)",
        },
      ]}
    />
  );
}

/**
 * Certify's equivalent of the cheaper-host strip, over List B.
 *
 * Same four shapes as the arbitrage panel: what was found, what it is worth
 * over the window, the best single one, and how much of what we could measure
 * actually certified. The "available" figure is the benchmark-only portion —
 * certified swaps on workloads no cheaper host already reaches — so the ring
 * adds cleanly to the arbitrage panel instead of double-counting overlap.
 */
export function BenchmarkStats({ ctl }: { ctl: DashboardController }) {
  const { data, activeRange } = ctl;
  const all = data.qualityMatched;
  const found = levelCount(data, "quality_match");
  const available = data.certifySavings.benchmarkOnly;
  const measuredSpend = data.totals.spend;
  const bestPct = all.length > 0 ? Math.max(...all.map((r) => r.savingPct)) : 0;
  const certifiable = data.stats.qualityCertifiable ?? data.stats.qualityEvaluated;
  const rate = certificationRate(data.stats);

  return (
    <ListStatsPanel
      eyebrow={`Benchmark check · ${activeRange.long}`}
      period={activeRange.long}
      ringSaving={available}
      ringSpend={measuredSpend}
      ringLabel="Certified switches"
      stats={[
        {
          label: "Certified switches found",
          value: `${found}`,
          sub: "quality proven before the swap is offered",
          accent: "oklch(0.83 0.11 195)",
        },
        {
          label: `Available · ${activeRange.long}`,
          value: usd(available, 0),
          sub: "certified swaps not already reachable by a cheaper host",
          accent: "oklch(0.82 0.16 155)",
        },
        {
          label: "Best single saving",
          value: bestPct > 0 ? `${bestPct.toFixed(0)}%` : "—",
          sub: bestPct > 0 ? "on one workload's model swap" : "nothing cleared the bar",
          accent: "oklch(0.86 0.09 265)",
        },
        {
          label: "Certification rate",
          value: certifiable > 0 ? `${Math.round(rate)}%` : "—",
          sub: certifiable > 0 ? "of everything we could measure" : "nothing measurable yet",
          accent: "oklch(0.9 0.03 285)",
        },
      ]}
    />
  );
}


/**
 * List A — same model, cheaper host.
 *
 * `discovery` is set by Compare and Certify: those levels prove a switch, they
 * never execute one, so the row links to Rightsize instead of activating.
 */
export function ArbitrageList({
  ctl,
  discovery = false,
  upsellHref,
}: {
  ctl: DashboardController;
  discovery?: boolean;
  /**
   * Dispatch 221. Override the locked-teaser destination. `null` suppresses
   * the link entirely; omit to keep the Certify → Rightsize default.
   */
  upsellHref?: string | null;
}) {
  const { data, canAct, activate, busy, errorFor, ctaHref, ctaLabel, activeRange, rightsizeHref } =
    ctl;
  const teaserHref = upsellHref === undefined ? rightsizeHref : upsellHref;
  const all = data.hostArbitrage;
  /**
   * Dispatch 231. Badge money and badge count come from the shared figures
   * path, never a local reduce: when the level is locked the array is empty by
   * design and only `levelSaving`/`levelCount` know the real numbers behind
   * the paywall. A local sum printed "$0 · 0 found" above a panel stating the
   * true figure.
   */
  const total = levelSaving(data, "host_arbitrage");
  const found = levelCount(data, "host_arbitrage");
  /**
   * Dispatch 213 grouped findings per workload; Dispatch 231 stops the
   * grouping from deleting cards. Every finding the badge counted is drawn.
   * A row that does not hold its workload's best option renders
   * disclosure-only, cross-referenced to where the money is actionable.
   */
  const rows = all;
  const supersededFor = (r: { fromModel: string; fromHost: string; taskHint: string; toModel: string; toHost: string }) =>
    supersededOption(
      groupFor(data.workloadGroups, {
        fromModel: r.fromModel,
        fromHost: r.fromHost,
        taskHint: r.taskHint,
      }),
      { kind: "host_arbitrage", toModel: r.toModel, toHost: r.toHost },
    );

  return (
    <section>
      {/**
       * Dispatch 232. The Compare hero's five framing figures ride with the
       * list itself, so every rung that merges arbitrage in — Certify,
       * Rightsize, Govern — states them without a trip to Compare.
       */}
      <ArbitrageStats ctl={ctl} />

      <SectionTitle
        eyebrow="List A · arbitrage saves"
        title="Same model, cheaper host"
        hint="Identical model weights on a different provider. No benchmark is needed — the output is the same model's output."
        badge={`${usd(total, 0)} · ${activeRange.long} · ${found} found`}
        badgeTone="saving"
      />
      {!data.levels.host_arbitrage.unlocked ? (
        /* Parity with List B: a locked level shows its real count and money. */
        <LevelLocked
          requiredPlan={data.levels.host_arbitrage.requiredPlan}
          count={data.levels.host_arbitrage.lockedCount}
          saving={data.levels.host_arbitrage.lockedSaving}
          period={activeRange.long}
          what="cheaper-host"
          evaluated={data.stats.workloads}
        />
      ) : rows.length === 0 ? (
        <LevelEmpty state={data.dataState} kind="host_arbitrage" />
      ) : (
        <div className="space-y-3">
          {rows.map((row, i) => {
            const key = `host:${row.fromModel}|${row.fromHost}|${row.toHost}|${row.taskHint}`;
            const sup = supersededFor(row);
            return (
              <div key={key} className="space-y-2">
              <SwitchCard
                supersededBy={sup}
                supersededHere={sup?.kind === "host_arbitrage"}
                row={asSwitchRow(row, "host")}
                period={activeRange.long}
                rank={i + 1}
                pending={busy(key)}
                error={errorFor(key)}
                ctaHref={ctaHref}
                ctaLabel={ctaLabel}
                discovery={discovery}
                discoveryHref={rightsizeHref}
                activeSwitch={ctl.pending.activeFrom(row.fromModel, row.fromHost)}
                readOnly={ctl.demoReadOnly}
                onActivate={
                  canAct && !discovery && !sup
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
              <WorkloadAlternatives
                group={groupFor(data.workloadGroups, {
                  fromModel: row.fromModel,
                  fromHost: row.fromHost,
                  taskHint: row.taskHint,
                })}
                period={activeRange.long}
                upsellHref={teaserHref ?? undefined}
              />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** List B — different model, quality proven before it is offered. */
export function BenchmarkList({
  ctl,
  discovery = false,
  upsellHref,
}: {
  ctl: DashboardController;
  discovery?: boolean;
  /** Dispatch 221. See ArbitrageList. */
  upsellHref?: string | null;
}) {
  const { data, canAct, activate, busy, errorFor, ctaHref, ctaLabel, activeRange, rightsizeHref } =
    ctl;
  const teaserHref = upsellHref === undefined ? rightsizeHref : upsellHref;
  const level = data.levels.quality_match;
  const all = data.qualityMatched;
  /** Dispatch 231: shared figures path, so a locked level states its real money. */
  const total = levelSaving(data, "quality_match");
  const found = levelCount(data, "quality_match");
  const rows = all;
  const supersededFor = (r: { fromModel: string; fromHost: string; taskHint: string; toModel: string; toHost: string }) =>
    supersededOption(
      groupFor(data.workloadGroups, {
        fromModel: r.fromModel,
        fromHost: r.fromHost,
        taskHint: r.taskHint,
      }),
      { kind: "quality_match", toModel: r.toModel, toHost: r.toHost },
    );

  return (
    <section>
      {/* Parity with List A: the benchmark check states its own figures. */}
      <BenchmarkStats ctl={ctl} />

      <SectionTitle
        eyebrow="List B · benchmark saves"
        title="Cheaper model, same measured quality"
        hint={`Checked against ${data.coverage.evaluations} independent benchmark tests before the swap is offered.`}
        badge={`${usd(total, 0)} · ${activeRange.long} · ${found} found`}
        badgeTone="saving"
      />
      {!level.unlocked ? (
        <LevelLocked
          requiredPlan={level.requiredPlan}
          count={level.lockedCount}
          saving={level.lockedSaving}
          period={activeRange.long}
          what="quality-matched"
          evaluated={data.stats.workloads}
        />
      ) : rows.length === 0 ? (
        <LevelEmpty state={data.dataState} kind="quality_match" />
      ) : (
        <div className="space-y-3">
          {rows.map((row, i) => {
            const key = `quality:${row.fromModel}|${row.toModel}|${row.taskHint}`;
            const sup = supersededFor(row);
            return (
              <div key={key} className="space-y-2">
              <SwitchCard
                supersededBy={sup}
                supersededHere={sup?.kind === "quality_match"}
                row={asSwitchRow(row, "quality")}
                period={activeRange.long}
                rank={i + 1}
                pending={busy(key)}
                error={errorFor(key)}
                ctaHref={ctaHref}
                ctaLabel={ctaLabel}
                discovery={discovery}
                discoveryHref={rightsizeHref}
                activeSwitch={ctl.pending.activeFrom(row.fromModel, row.fromHost)}
                readOnly={ctl.demoReadOnly}
                onActivate={
                  canAct && !discovery && !sup
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
              <WorkloadAlternatives
                group={groupFor(data.workloadGroups, {
                  fromModel: row.fromModel,
                  fromHost: row.fromHost,
                  taskHint: row.taskHint,
                })}
                period={activeRange.long}
                upsellHref={teaserHref ?? undefined}
              />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/**
 * List C — evaluated, and deliberately not turned into a recommendation.
 *
 * Dispatch 217: `discovery` silences the running-switch disclosure entirely.
 * Compare and Certify never reference execution, so on those levels this row
 * states the verdict and nothing about traffic.
 */
export function NonQualifyingList({
  ctl,
  discovery = false,
}: {
  ctl: DashboardController;
  discovery?: boolean;
}) {
  const rows = ctl.data.nonQualifying;
  /** Zero workloads means nothing was evaluated — not that everything passed. */
  const evaluated = ctl.data.stats.workloads;

  return (
    <section>
      <SectionTitle
        eyebrow="List C · nothing worth switching"
        title="Evaluated, and saving you nothing"
        hint="Each row carries the certification engine's own verdict for that workload — not a generic refusal."
        badge={`${rows.length} refused`}
        badgeTone="opportunity"
      />
      {rows.length === 0 ? (
        <div className="card-surface p-6 text-sm text-muted-foreground">
          {nonQualifyingEmptyCopy(evaluated)}
        </div>
      ) : (

        <div className="card-surface divide-y divide-border overflow-hidden">
          {rows.map((r, i) => (
            <div
              /* Deduped one row per workload upstream; the index keeps the key
                 unique even if a future upstream change stops guaranteeing it. */
              key={`${r.fromModel}|${r.fromHost}|${r.taskHint}#${i}`}
              className="flex flex-wrap items-center gap-x-6 gap-y-2 p-5"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <ShieldOff className="size-4" />
              </span>
              <div className="min-w-60 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-mono text-sm">{r.fromModel}</span>
                  <span className="text-[11px] text-muted-foreground">{r.fromHost}</span>
                  <ArrowRight className="size-3.5 text-muted-foreground/60" />
                  <span className="text-xs text-muted-foreground">no switch offered</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{r.detail}</p>
                {!discovery && ctl.pending.from(r.fromModel, r.fromHost) ? (
                  /*
                   * The generic pending label reads as a contradiction here:
                   * this row already says "no switch offered", meaning the
                   * certification engine found nothing. A switch from a
                   * different mechanism can still be running on the same
                   * workload, so the sentence has to name that difference.
                   */
                  <p className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-medium text-primary">
                    <Clock className="size-3" />
                    A switch from another mechanism is already running here — traffic not yet moved
                  </p>
                ) : null}
              </div>
              <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-semibold tracking-wide text-muted-foreground">
                {r.label}
              </span>
              {r.alsoLabels.length > 0 ? (
                <span className="text-[11px] text-muted-foreground">
                  also: {r.alsoLabels.join(", ")}
                </span>
              ) : null}
              <div className="text-right">
                <div className="num text-base text-spend">{usd(r.monthlySpend, 0)}</div>
                <p className="text-[11px] text-muted-foreground">
                  a month at the {ctl.activeRange.long} rate, unchanged
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
