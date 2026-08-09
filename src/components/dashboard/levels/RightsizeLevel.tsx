import { Link } from "@tanstack/react-router";
import { ArrowRight, ArrowUpRight, Clock, Loader2, Snowflake, TrendingDown, Zap } from "lucide-react";

import {
  EmptyState,
  HeroStat,
  LevelHero,
  Legend,
  RangeToggle,
  SectionTitle,
  SwitchControls,
} from "@/components/dashboard/primitives";
import { SavingsRing } from "@/components/dashboard/SavingsRing";
import { UsageSection } from "@/components/dashboard/DashboardShell";
import { GovernUpsell, LevelEmpty, LevelLocked } from "@/components/dashboard/LevelState";
import { TransparencyLists } from "@/components/dashboard/TransparencyLists";
import type { DashboardController } from "@/components/dashboard/useDashboardController";
import { PENDING_SWITCH_LABEL } from "@/lib/dashboard/pending-switch";
import {
  ExecutionSubtitle,
  SwitchAction,
  actionLabelFor,
} from "@/components/dashboard/ExecutionNote";
import { usd } from "@/lib/dashboard-data";
import { captureFigures, levelCount, levelSaving } from "@/lib/dashboard/figures";

/**
 * Rightsize — everything the earlier levels found, plus oversized models, and
 * the controls to actually switch.
 *
 * The hero is a deliberate pair: what is already saving money, next to what is
 * sitting there unactivated. That contrast is the whole point of the level —
 * the gap between them is the cost of not clicking.
 *
 * The two sections below the hero are exported, because Govern is Rightsize
 * plus autonomy — it renders the same content rather than a narrower copy of it.
 */
/**
 * The three saving mechanisms a Rightsize/Govern plan runs, each as its own
 * real window sum — arbitrage (Compare's mechanism), benchmark (Certify's) and
 * rightsize (this level's own). They are stated separately so the customer can
 * see, card by card, what the upgrade actually bought them.
 *
 * The three are gross per mechanism: a workload found by two of them is in
 * both sums. `available` already removes that double count via the Round 3
 * dedup, and `overlapUsd` is the exact amount removed — so the reconciliation
 * arbitrage + benchmark + rightsize − overlap = gross-deduped holds on screen.
 */
export interface MechanismSavings {
  arbitrage: number;
  benchmark: number;
  rightsize: number;
  arbitrageCount: number;
  benchmarkCount: number;
  rightsizeCount: number;
  overlapUsd: number;
  overlapCount: number;
  /** Naive sum of the three mechanisms, before the double count is removed. */
  sum: number;
  /** sum − overlap. What is still on the table, each workload counted once. */
  available: number;
  /** Real dollars already saved by running switches inside the window. */
  captured: number;
  /** available + captured. Everything this window identified. */
  identified: number;
}

export function mechanismSavings(ctl: DashboardController): MechanismSavings {
  const { data } = ctl;
  const arbitrage = levelSaving(data, "host_arbitrage");
  const benchmark = levelSaving(data, "quality_match");
  const rightsize = levelSaving(data, "rightsize");
  return {
    arbitrage,
    benchmark,
    rightsize,
    arbitrageCount: levelCount(data, "host_arbitrage"),
    benchmarkCount: levelCount(data, "quality_match"),
    rightsizeCount: levelCount(data, "rightsize"),
    overlapUsd: data.savings.overlapUsd,
    overlapCount: data.savings.overlapCount,
    sum: arbitrage + benchmark + rightsize,
    available: data.savings.available,
    captured: data.savings.captured,
    identified: captureFigures(data.savings).identified,
  };
}

/**
 * The two sentences that reconcile every headline figure on screen:
 *   arbitrage + benchmark + rightsize − overlap = available
 *   available + captured                        = identified
 * Stated in that order so no figure on the page is asserted without its
 * arithmetic being visible next to it.
 */
export function mechanismSentence(m: MechanismSavings): string {
  return `${usd(m.arbitrage, 0)} arbitrage + ${usd(m.benchmark, 0)} benchmark + ${usd(
    m.rightsize,
    0,
  )} rightsize, less ${usd(m.overlapUsd, 0)} counted twice across ${m.overlapCount} shared workload${
    m.overlapCount === 1 ? "" : "s"
  }, is ${usd(m.available, 0)} still available; plus ${usd(m.captured, 0)} already captured by switches you are running makes ${usd(m.identified, 0)} identified.`;
}


/** The three mechanism cards, in the same visual pattern Certify uses. */
export function MechanismStats({ mech }: { mech: MechanismSavings }) {
  return (
    <>
      <HeroStat
        label="Arbitrage saving"
        value={usd(mech.arbitrage, 0)}
        sub="Same model, cheaper host — no benchmark needed"
        accent="oklch(0.86 0.09 265)"
      />
      <HeroStat
        label="Benchmark saving"
        value={usd(mech.benchmark, 0)}
        sub="Different model, quality proven before it is shown"
        accent="oklch(0.83 0.11 195)"
      />
      <HeroStat
        label="Rightsize saving"
        value={usd(mech.rightsize, 0)}
        sub={`Oversized waste on ${mech.rightsizeCount} overpowered workload${mech.rightsizeCount === 1 ? "" : "s"}`}
        accent="oklch(0.83 0.13 55)"
      />
    </>
  );
}

export function RightsizeLevel({ ctl }: { ctl: DashboardController }) {

  const { data, range, setRange, activeRange, live } = ctl;
  const { savings } = data;
  // Captured and available are both real sums over the same window, so the
  // capture rate is a like-for-like ratio on every period tab.
  const capture = captureFigures(savings);
  const mech = mechanismSavings(ctl);

  return (
    <>
      <LevelHero
        eyebrow={
          <>
            <span className="rounded-full bg-white/10 px-2.5 py-1 font-semibold tracking-wide uppercase">
              Level 3 · Rightsize
            </span>
            <RangeToggle range={range} onChange={setRange} dark />
          </>
        }
        headline={
          <>
            <span className="num text-[oklch(0.82_0.16_155)]">{usd(savings.captured)}</span>{" "}
            <span className="text-white/80">already saved.</span>{" "}
            <span className="num text-[oklch(0.83_0.11_195)]">{usd(savings.available)}</span>{" "}
            <span className="text-white/80">left on the table.</span>
          </>
        }
        sub={`${usd(savings.captured, 0)} captured and ${usd(savings.available, 0)} available never overlap: a switch only books savings once its traffic has moved, and once it moves that workload stops appearing as an opportunity. Your plan runs all three mechanisms over the ${activeRange.long} of your own traffic: ${mechanismSentence(mech)} No projections, and each workload counted once. Activating is one click and reversible.`}
        stats={
          <>
            <HeroStat
              label={`Spend · ${activeRange.long}`}
              value={usd(live.spend)}
              sub="through the hosts you use today"
              accent="oklch(0.85 0.1 300)"
            />
            <MechanismStats mech={mech} />
            <HeroStat
              label={`Captured · ${activeRange.long}`}
              value={usd(savings.captured, 0)}
              sub={`saved by ${data.activeSwitches.length + data.switchesOutsideWindow} switches already running`}
              accent="oklch(0.82 0.16 155)"
            />
            <HeroStat
              label={`Available · ${activeRange.long}`}
              value={usd(savings.available, 0)}
              sub={`waiting on ${savings.certifiedCount} not-yet-switched workload${savings.certifiedCount === 1 ? "" : "s"} — one certified switch each`}
              accent="oklch(0.83 0.11 195)"
            />

            <HeroStat
              label="Savings captured"
              value={`${capture.pct}%`}
              sub={`of ${usd(capture.identified, 0)} identified`}
              accent="oklch(0.86 0.09 265)"
            />
            <HeroStat
              label="Frozen switches"
              value={`${data.frozen} frozen`}
              sub={
                data.frozen === 0
                  ? "none paused — every running switch is healthy"
                  : "paused after a regression, waiting for your review"
              }
              accent="oklch(0.9 0.03 285)"
            />

          </>
        }

        aside={
          <>
            <SavingsRing
              captured={savings.captured}
              available={savings.available}
              period={activeRange.long}
            />
            <div className="mt-4 flex justify-center gap-5 text-xs text-white/70">
              <Legend color="oklch(0.65 0.15 158)" label="Captured" />
              <Legend color="oklch(0.72 0.11 195)" label="Available" />
            </div>
          </>
        }
      >
        {/* Manual switching is what this level sells, so the control sits in
            the hero: the single biggest certified switch, one click, reversible. */}
        <TopSwitchControl ctl={ctl} />
      </LevelHero>

      {/* Next rung: the same gate, applied without waiting for a human.
          Sits directly under the hero, matching the cross-sell banner slot
          the other levels use. */}
      <GovernUpsell
        to={ctl.scope === "demo" ? "/demo/govern" : "/workspace/govern"}
        unlocked={data.govern.unlocked}
        eligibleCount={data.govern.eligible.length}
        eligibleSaving={data.govern.eligibleSaving}
        running={data.govern.running}
        period={activeRange.long}
      />

      <UsageSection ctl={ctl} />
      <TransparencyLists ctl={ctl} />
      <OversizedSection ctl={ctl} />
      <ActiveSwitchesSection ctl={ctl} />


    </>
  );
}

/**
 * The hero's one-click switch.
 *
 * Rightsize's product is manual switching, so the largest certified switch is
 * actionable before any scrolling happens. It is the same mutation the row
 * below uses — no second code path, no second source of truth.
 */
export function TopSwitchControl({ ctl }: { ctl: DashboardController }) {
  const { data, canAct, activate, busy, errorFor, ctaHref, ctaLabel } = ctl;
  const arb = data.hostArbitrage[0];
  const qual = data.levels.quality_match.unlocked ? data.qualityMatched[0] : undefined;
  const best = arb && qual ? (arb.saving >= qual.saving ? arb : qual) : (arb ?? qual);
  if (!best) return null;
  const isArb = best === arb;
  const key = isArb
    ? `host:${best.fromModel}|${best.fromHost}|${best.toHost}|${best.taskHint}`
    : `quality:${best.fromModel}|${best.toModel}|${best.taskHint}`;

  return (
    <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4 rounded-2xl bg-white/10 p-5 backdrop-blur">
      <div className="min-w-60 flex-1">
        <p className="text-[11px] font-semibold tracking-widest text-white/55 uppercase">
          Biggest switch waiting on you
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-mono text-sm text-white/60 line-through decoration-white/30">
            {best.fromModel}
          </span>
          <ArrowRight className="size-3.5 text-white/70" />
          <span className="font-mono text-sm font-semibold text-white">{best.toModel}</span>
          <span className="text-[11px] text-white/55">
            {best.toHostLabel || best.toHost} · {best.taskHint}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-white/55">
          {isArb ? "Same model, cheaper host" : "Quality-proven model swap"} · reversible at any
          time
        </p>
      </div>
      <div className="text-right">
        <div className="num text-3xl text-[oklch(0.86_0.16_155)]">
          {usd(best.saving, 0)}
          <span className="text-sm text-white/55"> · {ctl.activeRange.long}</span>
        </div>
      </div>
      {/* Dispatch 159: the state is a subtitle of the control it explains. */}
      <SwitchAction execution={best.execution} dark align="left">
      {ctl.pending.pair(best.fromModel, best.fromHost, best.toModel, best.toHost) ? (
        /* Same rule as the rows below: state before action. */
        <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-5 py-2.5 text-xs font-semibold text-white/85">
          <Clock className="size-4" />
          {PENDING_SWITCH_LABEL}
        </span>
      ) : canAct ? (
        <button
          type="button"
          disabled={busy(key)}
          onClick={() =>
            activate.mutate({
              key,
              kind: isArb ? "host_arbitrage" : "quality_match",
              fromModel: best.fromModel,
              fromHost: best.fromHost,
              toModel: best.toModel,
              toHost: best.toHost,
              taskHint: best.taskHint,
            })
          }
          className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[oklch(0.22_0.07_285)] transition-transform active:scale-95 disabled:opacity-60"
        >
          {busy(key) ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
          {busy(key) ? "Switching…" : actionLabelFor(best.execution, "Switch now")}
        </button>
      ) : ctl.demoReadOnly ? (
        /* The demo is a showcase, not a console: the action reads as a label. */
        <span className="inline-flex items-center gap-2 rounded-full border border-white/25 px-5 py-2.5 text-sm font-semibold text-white/80">
          <Zap className="size-4" />
          Switch
        </span>
      ) : (
        <Link
          to={ctaHref}
          className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[oklch(0.22_0.07_285)]"
        >
          {ctaLabel}
          <ArrowUpRight className="size-4" />
        </Link>
      )}
      </SwitchAction>

      {errorFor(key) ? (
        <p className="w-full text-[11px] text-[oklch(0.8_0.15_25)]">{errorFor(key)}</p>
      ) : null}
    </div>
  );
}

/** Frontier models doing economy-tier work, with the switch that fixes it. */
export function OversizedSection({ ctl }: { ctl: DashboardController }) {
  const { data, canAct, activate, busy, errorFor, ctaHref, ctaLabel, activeRange } = ctl;
  const level = data.levels.rightsize;
  const rsKey = (o: { model: string; hostKey: string; task: string }) =>
    `rightsize:${o.model}|${o.hostKey}|${o.task}`;

  return (
    <section>
      <SectionTitle
        eyebrow="Attention needed"
        title="Overpowered for the task"
        hint="Frontier-tier models running work an economy tier handles."
        badge={`${data.oversized.length} workloads`}
        badgeTone="opportunity"
      />
      {!level.unlocked ? (
        <LevelLocked
          requiredPlan={level.requiredPlan}
          count={level.lockedCount}
          saving={level.lockedSaving}
          period={activeRange.long}
          what="oversized workload"
          evaluated={data.stats.workloads}
        />
      ) : data.oversized.length === 0 ? (
        <LevelEmpty state={data.dataState} kind="rightsize" />
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
                  overspend in the {activeRange.long}
                </span>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{o.note}</p>
              {o.toModel ? (
                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-opportunity/20 pt-3">
                  <span className="text-xs text-muted-foreground">
                    Right-size to <span className="font-mono text-foreground">{o.toModel}</span>
                  </span>
                  <SwitchAction execution={o.execution} className="ml-auto">
                  {ctl.pending.fromTo(o.model, o.hostKey, o.toModel!) ? (
                    // The right-size switch is running; the traffic is not on
                    // it yet, so the waste above is still real.
                    <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-opportunity/40 bg-opportunity/10 px-3.5 py-1.5 text-[11px] font-semibold text-opportunity">
                      <Clock className="size-3" />
                      {PENDING_SWITCH_LABEL}
                    </span>
                  ) : canAct ? (
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
                      {actionLabelFor(o.execution, "Right-size now")}
                    </button>
                  ) : ctl.demoReadOnly ? (
                    <span className="ml-auto rounded-full border border-opportunity/50 px-3.5 py-1.5 text-xs font-semibold text-opportunity">
                      Switch
                    </span>
                  ) : (
                    <Link
                      to={ctaHref}
                      className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-opportunity/50 px-3.5 py-1.5 text-xs font-semibold text-opportunity transition-colors hover:bg-opportunity/10"
                    >
                      {ctaLabel}
                      <ArrowUpRight className="size-3" />
                    </Link>
                  )}
                  </SwitchAction>

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
  );
}

/**
 * Dispatch 161. One card, two lists.
 *
 * A switch that is activated is not necessarily a switch that is executing.
 * Mixing both under a header that asserts live execution is the LIVE-is-
 * absolute violation this section was split for: "Rerouting now" contains only
 * switches whose execution state is `automatic`, and nothing else may claim a
 * captured figure.
 */
function ActiveSwitchCard({
  s,
  ctl,
}: {
  s: DashboardController["data"]["activeSwitches"][number];
  ctl: DashboardController;
}) {
  const { canAct, lifecycle, busy, errorFor } = ctl;
  const rerouting = s.execution?.state === "automatic";
  return (
    <div className="card-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase ${
            s.badge === "Proven switch" ? "bg-saving-soft text-saving" : "bg-primary-soft text-primary"
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
        <span className="font-mono text-sm text-muted-foreground">{s.fromModel}</span>
        <ArrowRight className="size-3.5 text-primary" />
        <span className="font-mono text-sm font-semibold text-primary">{s.toModel}</span>
        <span className="text-[11px] text-muted-foreground">{s.toHost}</span>
      </div>
      {/* Two different facts about one switch, each named: what it saves per
          month at today's rate, and what it has saved so far. Neither exists
          until traffic has actually moved. */}
      {rerouting ? (
        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-3">
          <div>
            <p className="eyebrow">Run rate</p>
            {s.saved > 0 ? (
              <p className="num text-lg">
                {usd(s.monthlyRate, 0)}
                <span className="text-xs text-muted-foreground">/mo</span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Rate still calculating
                <span className="block text-[11px]">
                  first full day of traffic not measured yet
                </span>
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="eyebrow">Captured to date</p>
            <p className="num text-lg text-saving">+{usd(s.saved)}</p>
          </div>
        </div>
      ) : (
        <div className="mt-4 border-t border-border pt-3">
          <p className="eyebrow">Captured to date</p>
          <p className="text-sm font-semibold">No traffic moved yet</p>
          <p className="text-[11px] text-muted-foreground">
            This switch is recorded, not running. Nothing is captured until it reroutes.
          </p>
        </div>
      )}

      <SwitchControls
        state="active"
        busy={busy(`switch:${s.switchId}`)}
        error={errorFor(`switch:${s.switchId}`)}
        canAct={canAct}
        onAction={(action) =>
          lifecycle.mutate({ key: `switch:${s.switchId}`, switchId: s.switchId, action })
        }
      />

      {/* Dispatch 159: attached to the controls it describes. */}
      <ExecutionSubtitle
        execution={s.execution}
        align="left"
        className="mt-3 border-t border-border pt-3"
      />
    </div>
  );
}

/** What is rerouting traffic right now, what is only activated, and what is paused. */
export function ActiveSwitchesSection({ ctl }: { ctl: DashboardController }) {
  const { data, activeRange, canAct, lifecycle, busy, errorFor } = ctl;
  const waiting = data.dataState !== "ready";

  const rerouting = data.activeSwitches.filter((s) => s.execution?.state === "automatic");
  const notMoving = data.activeSwitches.filter((s) => s.execution?.state !== "automatic");

  return (
    <section>
      <SectionTitle
        eyebrow="Rerouting your traffic right now"
        title="Rerouting now"
        hint={`Activated in the ${activeRange.long} and actually moving requests today, ranked by amount saved.${
          data.switchesOutsideWindow > 0
            ? ` ${data.switchesOutsideWindow} more started before this window.`
            : ""
        }`}
        badge={`${rerouting.length} rerouting`}
        badgeTone="spend"
      />
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-3">
          {rerouting.length === 0 ? (
            <EmptyState
              text={
                waiting
                  ? data.dataState === "awaiting_first_event"
                    ? "No switch can run until your first event lands. Connect your gateway and the meter starts here."
                    : "No switch was activated inside this window. Widen the range to see earlier activations."
                  : notMoving.length > 0
                    ? `Nothing is rerouting yet. ${notMoving.length} activated switch${notMoving.length === 1 ? "" : "es"} below ${notMoving.length === 1 ? "is" : "are"} recorded and waiting on a step outside this dashboard.`
                    : "Nothing rerouted yet. Activating a same-provider switch starts rerouting immediately; a switch to another provider is recorded here and waits for you to allow routing to it."
              }
            />
          ) : (
            rerouting.map((s) => <ActiveSwitchCard key={s.switchId} s={s} ctl={ctl} />)
          )}

          {notMoving.length > 0 ? (
            <div className="pt-6">
              <SectionTitle
                eyebrow="Activated, but nothing is moving"
                title="Activated, waiting on you"
                hint="Recorded and priced, not executing. Each one names the single step that would start it. No money is captured while a switch waits."
                badge={`${notMoving.length} waiting`}
                badgeTone="spend"
              />
              <div className="space-y-3">
                {notMoving.map((s) => (
                  <ActiveSwitchCard key={s.switchId} s={s} ctl={ctl} />
                ))}
              </div>
            </div>
          ) : null}
        </div>


        <div className="space-y-4">
          <div className="card-surface flex items-center gap-4 p-5">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-frozen-soft">
              <Snowflake className="size-5 text-frozen" />
            </div>
            <div>
              <div className="num text-3xl text-frozen">
                {data.frozen}
                <span className="text-base"> frozen</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {data.frozen === 0
                  ? "No switch has been paused after a quality or price regression."
                  : "Paused after a regression — resume or roll back below."}
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
              {s.autoPausedReason ? (
                <p className="mt-1 text-[11px] text-frozen">{s.autoPausedReason}</p>
              ) : null}
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
        </div>
      </div>
    </section>
  );
}
