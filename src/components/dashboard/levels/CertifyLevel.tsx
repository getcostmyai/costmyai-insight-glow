import {
  HeroStat,
  LevelHero,
  Legend,
  RangeToggle,
  SectionTitle,
  asSwitchRow,
} from "@/components/dashboard/primitives";
import { SavingsRing } from "@/components/dashboard/SavingsRing";
import { UsageSection } from "@/components/dashboard/DashboardShell";
import { SwitchCard } from "@/components/dashboard/SwitchCard";
import {
  HeroUpsell,
  LevelEmpty,
  LevelLocked,
  NextLevelUpsell,
  ObjectiveSelect,
} from "@/components/dashboard/LevelState";
import { ArbitrageList, NonQualifyingList } from "@/components/dashboard/TransparencyLists";
import type { DashboardController } from "@/components/dashboard/useDashboardController";
import { usd } from "@/lib/dashboard-data";

/**
 * Certify — a different model, proven to hold the same measured quality.
 *
 * This is the level where a refusal is the product. The hero therefore splits
 * the money two ways — what arbitrage alone found, and what only a benchmark
 * could justify — and puts the refusal count next to the certified count,
 * because "we checked and said no" is the reason the yes is worth anything.
 */
export function CertifyLevel({ ctl }: { ctl: DashboardController }) {
  const {
    data,
    range,
    setRange,
    activeRange,
    live,
    objective,
    chooseObjective,
    canAct,
    activate,
    busy,
    errorFor,
    ctaHref,
    ctaLabel,
    scope,
  } = ctl;
  const level = data.levels.quality_match;
  const rightsize = data.levels.rightsize;
  const rows = data.qualityMatched;

  // Real dollars over the window on screen, never a monthly projection.
  const benchmarkSaving = rows.reduce((s, r) => s + r.saving, 0);
  const arbitrageSaving = data.hostArbitrage.reduce((s, r) => s + r.saving, 0);
  const refused = data.stats.qualityRefused;
  const evaluated = data.stats.qualityEvaluated;
  const certifyRate = evaluated > 0 ? (data.stats.qualityCertified / evaluated) * 100 : 0;
  const rightsizeSaving = rightsize.unlocked
    ? data.oversized.reduce((s, r) => s + r.wasted, 0)
    : rightsize.lockedSaving;
  const rightsizeCount = rightsize.unlocked ? data.oversized.length : rightsize.lockedCount;

  return (
    <>
      <LevelHero
        eyebrow={
          <>
            <span className="rounded-full bg-white/10 px-2.5 py-1 font-semibold tracking-wide uppercase">
              Level 2 · Certify
            </span>
            <RangeToggle range={range} onChange={setRange} dark />
          </>
        }
        headline={
          <>
            <span className="num text-[oklch(0.83_0.11_195)]">{usd(benchmarkSaving)}</span>{" "}
            <span className="text-white/80">
              in the {activeRange.long} that only a benchmark can unlock.
            </span>
          </>
        }
        sub={`Measured against ${data.coverage.evaluations} evaluation bands. A switch we cannot prove against an independent third-party benchmark is refused — ${refused} ${refused === 1 ? "was" : "were"} refused on your traffic.`}
        stats={
          <>
            <HeroStat
              label={`Spend · ${activeRange.long}`}
              value={usd(live.spend)}
              sub="through the hosts you use today"
              accent="oklch(0.85 0.1 300)"
            />
            <HeroStat
              label="Arbitrage saving"
              value={usd(arbitrageSaving, 0)}
              sub="Same model, cheaper host — no benchmark needed"
              accent="oklch(0.86 0.09 265)"
            />
            <HeroStat
              label="Benchmark saving"
              value={usd(benchmarkSaving, 0)}
              sub="Different model, quality proven before it is shown"
              accent="oklch(0.83 0.11 195)"
            />
            <HeroStat
              label="Workloads evaluated"
              value={`${evaluated}`}
              sub={`${data.stats.qualityCertified} certified`}
              accent="oklch(0.82 0.16 155)"
            />
            <HeroStat
              label="Refused"
              value={`${refused}`}
              sub="could not be proven equivalent"
              accent="oklch(0.83 0.13 55)"
            />
            <HeroStat
              label="Certification rate"
              value={`${Math.round(certifyRate)}%`}
              sub="of everything we checked"
              accent="oklch(0.9 0.03 285)"
            />
          </>
        }
        aside={
          <>
            <SavingsRing
              captured={data.savings.captured}
              available={data.savings.available}
              period={activeRange.long}
            />
            <div className="mt-4 flex justify-center gap-5 text-xs text-white/70">
              <Legend color="oklch(0.65 0.15 158)" label="Captured" />
              <Legend color="oklch(0.72 0.11 195)" label="Available" />
            </div>
          </>
        }
      />

      <HeroUpsell
        to={scope === "demo" ? "/demo/rightsize" : "/workspace/rightsize"}
        requiredPlan="rightsize"
        count={rightsizeCount}
        saving={rightsizeSaving}
        period={activeRange.long}
        what="oversized workload"
        unlocked={rightsize.unlocked}
      />

      <UsageSection ctl={ctl} />

      <ArbitrageList ctl={ctl} />

      <section>
        <SectionTitle
          eyebrow="List B · benchmark saves"
          title="Cheaper model, same measured quality"
          hint={`Benchmarked against ${data.coverage.evaluations} measured evaluation bands before we recommend the swap.`}
          badge={`${rows.length} certified`}
          badgeTone="saving"
          aside={
            <div className="flex flex-col items-start gap-1 sm:items-end">
              <ObjectiveSelect
                value={objective}
                onChange={chooseObjective}
                locked={!level.unlocked}
                requiredPlan={level.requiredPlan}
              />
              {errorFor("objective") ? (
                <p className="max-w-xs text-[11px] text-destructive sm:text-right">
                  {errorFor("objective")}
                </p>
              ) : null}
            </div>
          }
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

      <NonQualifyingList ctl={ctl} />

      <section className="card-surface p-6">
        <p className="eyebrow">Why some switches never appear</p>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          {refused} candidate{refused === 1 ? "" : "s"} on your own traffic cleared on price and
          were still refused, because the measured quality gap fell outside the equivalence band for
          that task class. We would rather show you a smaller number we can defend than a larger one
          we cannot.
        </p>
      </section>

    </>
  );
}
