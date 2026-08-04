import { ArrowRight, Clock, ShieldOff } from "lucide-react";

import { SectionTitle, asSwitchRow } from "@/components/dashboard/primitives";
import { SwitchCard } from "@/components/dashboard/SwitchCard";
import { LevelEmpty, LevelLocked } from "@/components/dashboard/LevelState";
import type { DashboardController } from "@/components/dashboard/useDashboardController";
import { PENDING_SWITCH_LABEL } from "@/lib/dashboard/pending-switch";
import { usd } from "@/lib/dashboard-data";

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
      <ArbitrageList ctl={ctl} />
      <BenchmarkList ctl={ctl} />
      <NonQualifyingList ctl={ctl} />
    </>
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
}: {
  ctl: DashboardController;
  discovery?: boolean;
}) {
  const { data, canAct, activate, busy, errorFor, ctaHref, ctaLabel, activeRange, rightsizeHref } =
    ctl;
  const rows = data.hostArbitrage;
  // Real dollars over the window on screen — the same sum the hero shows.
  const total = rows.reduce((s, r) => s + r.saving, 0);

  return (
    <section>
      <SectionTitle
        eyebrow="List A · arbitrage saves"
        title="Same model, cheaper host"
        hint="Identical model weights on a different provider. No benchmark is needed — the output is the same model's output."
        badge={`${usd(total, 0)} · ${activeRange.long} · ${rows.length}`}
        badgeTone="saving"
      />
      {rows.length === 0 ? (
        <LevelEmpty state={data.dataState} kind="host_arbitrage" />
      ) : (
        <div className="space-y-3">
          {rows.map((row, i) => {
            const key = `host:${row.fromModel}|${row.fromHost}|${row.toHost}|${row.taskHint}`;
            return (
              <SwitchCard
                key={key}
                row={asSwitchRow(row, "host")}
                period={activeRange.long}
                rank={i + 1}
                pending={busy(key)}
                error={errorFor(key)}
                ctaHref={ctaHref}
                ctaLabel={ctaLabel}
                discovery={discovery}
                discoveryHref={rightsizeHref}
                pendingTraffic={ctl.pending.pair(
                  row.fromModel,
                  row.fromHost,
                  row.toModel,
                  row.toHost,
                )}
                readOnly={ctl.demoReadOnly}
                onActivate={
                  canAct && !discovery
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
  );
}

/** List B — different model, quality proven before it is offered. */
export function BenchmarkList({
  ctl,
  discovery = false,
}: {
  ctl: DashboardController;
  discovery?: boolean;
}) {
  const { data, canAct, activate, busy, errorFor, ctaHref, ctaLabel, activeRange, rightsizeHref } =
    ctl;
  const level = data.levels.quality_match;
  const rows = data.qualityMatched;
  const total = rows.reduce((s, r) => s + r.saving, 0);

  return (
    <section>
      <SectionTitle
        eyebrow="List B · benchmark saves"
        title="Cheaper model, same measured quality"
        hint={`Benchmarked against ${data.coverage.evaluations} measured evaluation bands before the swap is offered.`}
        badge={`${usd(total, 0)} · ${activeRange.long} · ${rows.length}`}
        badgeTone="saving"
      />
      {!level.unlocked ? (
        <LevelLocked
          requiredPlan={level.requiredPlan}
          count={level.lockedCount}
          saving={level.lockedSaving}
          period={activeRange.long}
          what="quality-matched"
        />
      ) : rows.length === 0 ? (
        <LevelEmpty state={data.dataState} kind="quality_match" />
      ) : (
        <div className="space-y-3">
          {rows.map((row, i) => {
            const key = `quality:${row.fromModel}|${row.toModel}|${row.taskHint}`;
            return (
              <SwitchCard
                key={key}
                row={asSwitchRow(row, "quality")}
                period={activeRange.long}
                rank={i + 1}
                pending={busy(key)}
                error={errorFor(key)}
                ctaHref={ctaHref}
                ctaLabel={ctaLabel}
                discovery={discovery}
                discoveryHref={rightsizeHref}
                pendingTraffic={ctl.pending.pair(
                  row.fromModel,
                  row.fromHost,
                  row.toModel,
                  row.toHost,
                )}
                readOnly={ctl.demoReadOnly}
                onActivate={
                  canAct && !discovery
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
  );
}

/** List C — evaluated, and deliberately not turned into a recommendation. */
export function NonQualifyingList({ ctl }: { ctl: DashboardController }) {
  const rows = ctl.data.nonQualifying;

  return (
    <section>
      <SectionTitle
        eyebrow="List C · non-qualifying"
        title="Evaluated, and saving you nothing"
        hint="Each row carries the certification engine's own verdict for that workload — not a generic refusal."
        badge={`${rows.length} refused`}
        badgeTone="opportunity"
      />
      {rows.length === 0 ? (
        <div className="card-surface p-6 text-sm text-muted-foreground">
          Every workload in this window produced a certified saving. Nothing was refused.
        </div>
      ) : (
        <div className="card-surface divide-y divide-border overflow-hidden">
          {rows.map((r) => (
            <div
              key={`${r.fromModel}|${r.fromHost}|${r.taskHint}`}
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
                {ctl.pending.from(r.fromModel, r.fromHost) ? (
                  <p className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-medium text-primary">
                    <Clock className="size-3" />
                    {PENDING_SWITCH_LABEL}
                  </p>
                ) : null}
              </div>
              <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-semibold tracking-wide text-muted-foreground">
                {r.label}
              </span>
              <div className="text-right">
                <div className="num text-base text-spend">{usd(r.monthlySpend, 0)}</div>
                <p className="text-[11px] text-muted-foreground">per month, unchanged</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
