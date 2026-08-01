import { Link } from "@tanstack/react-router";
import { ArrowRight, ArrowUpRight, Loader2, Snowflake, TrendingDown, Zap } from "lucide-react";

import {
  EmptyState,
  HeroStat,
  LevelHero,
  RangeToggle,
  SectionTitle,
  SwitchControls,
} from "@/components/dashboard/primitives";
import { SavingsRing } from "@/components/dashboard/SavingsRing";
import { LevelEmpty, LevelLocked } from "@/components/dashboard/LevelState";
import type { DashboardController } from "@/components/dashboard/useDashboardController";
import { usd } from "@/lib/dashboard-data";

/**
 * Rightsize — everything the earlier levels found, plus oversized models, and
 * the controls to actually switch.
 *
 * The hero is a deliberate pair: what is already saving money, next to what is
 * sitting there unactivated. That contrast is the whole point of the level —
 * the gap between them is the cost of not clicking.
 */
export function RightsizeLevel({ ctl }: { ctl: DashboardController }) {
  const {
    data,
    range,
    setRange,
    activeRange,
    canAct,
    activate,
    lifecycle,
    busy,
    errorFor,
    ctaHref,
    ctaLabel,
  } = ctl;
  const { savings, dataState } = data;
  const level = data.levels.rightsize;
  const waiting = dataState !== "ready";
  const totalOpportunity = savings.activeMonthly + savings.availableMonthly;
  const captureRate = totalOpportunity > 0 ? savings.activeMonthly / totalOpportunity : 0;
  const oversizedWaste = data.oversized.reduce((s, o) => s + o.wasted, 0);

  const rsKey = (o: { model: string; hostKey: string; task: string }) =>
    `rightsize:${o.model}|${o.hostKey}|${o.task}`;

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
            <span className="num text-[oklch(0.82_0.16_155)]">{usd(savings.activeMonthly)}</span>{" "}
            <span className="text-white/80">saving now.</span>{" "}
            <span className="num text-[oklch(0.83_0.11_195)]">{usd(savings.availableMonthly)}</span>{" "}
            <span className="text-white/80">still waiting.</span>
          </>
        }
        sub={`Both figures are monthly run-rates measured across your last ${savings.basisDays} days of traffic — the same basis on every period tab. Activating is one click and reversible.`}
        stats={
          <>
            <HeroStat
              label="Active saving"
              value={usd(savings.activeMonthly, 0)}
              sub={`${data.activeSwitches.length + data.switchesOutsideWindow} switches rerouting traffic`}
              accent="oklch(0.82 0.16 155)"
            />
            <HeroStat
              label="Available to activate"
              value={usd(savings.availableMonthly, 0)}
              sub={`${savings.certifiedCount} certified switches`}
              accent="oklch(0.83 0.11 195)"
            />
            <HeroStat
              label="Oversized waste"
              value={usd(oversizedWaste, 0)}
              sub={`${data.oversized.length} workloads flagged`}
              accent="oklch(0.83 0.13 55)"
            />
            <HeroStat
              label="Savings captured"
              value={`${Math.round(captureRate * 100)}%`}
              sub={`of ${usd(totalOpportunity, 0)} identified`}
              accent="oklch(0.86 0.09 265)"
            />
            <HeroStat
              label="Frozen"
              value={`${data.frozen}`}
              sub={data.frozen === 0 ? "all healthy" : "review needed"}
              accent="oklch(0.9 0.03 285)"
            />
          </>
        }
        aside={
          <SavingsRing captured={savings.activeMonthly} available={savings.availableMonthly} />
        }
      />

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
            monthly={level.lockedMonthly}
            what="oversized-workload"
          />
        ) : data.oversized.length === 0 ? (
          <LevelEmpty state={dataState} kind="rightsize" />
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
                      Right-size to <span className="font-mono text-foreground">{o.toModel}</span>
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
                    ) : (
                      <Link
                        to={ctaHref}
                        className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-opportunity/50 px-3.5 py-1.5 text-xs font-semibold text-opportunity transition-colors hover:bg-opportunity/10"
                      >
                        {ctaLabel}
                        <ArrowUpRight className="size-3" />
                      </Link>
                    )}
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

      <section>
        <SectionTitle
          eyebrow="Working for you right now"
          title="Active switches"
          hint={`Activated in the ${activeRange.long}, ranked by amount saved.${
            data.switchesOutsideWindow > 0
              ? ` ${data.switchesOutsideWindow} more started before this window.`
              : ""
          }`}
          badge={`${data.activeSwitches.length} in window`}
          badgeTone="spend"
        />
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-3">
            {data.activeSwitches.length === 0 ? (
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
              data.activeSwitches.map((s) => (
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
                    <span className="font-mono text-sm text-muted-foreground">{s.fromModel}</span>
                    <ArrowRight className="size-3.5 text-primary" />
                    <span className="font-mono text-sm font-semibold text-primary">{s.toModel}</span>
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
          </div>
        </div>
      </section>
    </>
  );
}
