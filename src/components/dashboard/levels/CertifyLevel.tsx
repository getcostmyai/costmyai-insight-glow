import {
  HeroStat,
  LevelHero,
  RangeToggle,
  SectionTitle,
  asSwitchRow,
} from "@/components/dashboard/primitives";
import { OpportunityRing } from "@/components/dashboard/SavingsRing";
import { UsageSection } from "@/components/dashboard/DashboardShell";
import { SwitchCard } from "@/components/dashboard/SwitchCard";
import {
  HeroUpsell,
  LevelEmpty,
  LevelLocked,
  ObjectiveSelect,
} from "@/components/dashboard/LevelState";

import { ArbitrageList, NonQualifyingList } from "@/components/dashboard/TransparencyLists";
import { WorkloadAlternatives } from "@/components/dashboard/WorkloadAlternatives";
import { groupFor, isBestRow } from "@/lib/dashboard/group";
import type { DashboardController } from "@/components/dashboard/useDashboardController";
import { usd } from "@/lib/dashboard-data";
import { certificationRate, levelCount, levelSaving } from "@/lib/dashboard/figures";

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
    errorFor,
    rightsizeHref,
    scope,
  } = ctl;
  const level = data.levels.quality_match;
  const rightsize = data.levels.rightsize;
  const all = data.qualityMatched;
  /** Dispatch 213: one merged card per workload, alternatives collapsed under it. */
  const rows = all.filter((r) =>
    isBestRow(
      groupFor(data.workloadGroups, {
        fromModel: r.fromModel,
        fromHost: r.fromHost,
        taskHint: r.taskHint,
      }),
      { kind: "quality_match", toModel: r.toModel, toHost: r.toHost },
    ),
  );

  // Real dollars over the window on screen, never a monthly projection.
  const benchmarkSaving = levelSaving(data, "quality_match");
  const arbitrageSaving = levelSaving(data, "host_arbitrage");
  // The two checks this level is responsible for, deduped per workload by the
  // server. Never the three-mechanism total: Certify cannot see the third.
  const certifyIdentified = data.certifySavings.identified;

  // Dispatch 172. Refusals are split by whether a measurement actually
  // happened. A workload with no instrument for its task class was never
  // tested, so it cannot be described as having failed an equivalence band.
  const refused = data.stats.qualityRefused;
  const refusedMeasured = data.stats.qualityRefusedMeasured ?? refused;
  const unmeasurable = data.stats.qualityRefusedUnmeasurable ?? 0;
  /** Measured fine, but nothing cheaper was worth switching to. */
  const noCandidate = data.stats.qualityRefusedNoCandidate ?? 0;

  const evaluated = data.stats.qualityEvaluated;
  const certifiable = data.stats.qualityCertifiable ?? evaluated;
  const certifyRate = certificationRate(data.stats);

  const rightsizeSaving = levelSaving(data, "rightsize");
  const rightsizeCount = levelCount(data, "rightsize");

  /*
   * Dispatch 213. The the shared-workload double-count sentence
   * sentence is gone: Certify's two lists no longer render the same workload
   * twice, so there is no double count on screen for the prose to reconcile.
   * The ring still shows the deduped `certifySavings.identified` figure — what
   * is counted did not change, only how it is laid out.
   */
  const certifyArithmetic = `${usd(arbitrageSaving, 0)} from cheaper hosts and ${usd(benchmarkSaving, 0)} from certified model swaps is ${usd(certifyIdentified, 0)} identified on this level, each workload counted once.`;

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
        sub={`${certifyArithmetic} Measured against ${data.coverage.evaluations} independent benchmark tests. A switch we cannot prove against an independent third-party benchmark is refused — ${refusedMeasured} ${refusedMeasured === 1 ? "was" : "were"} measured and refused on your traffic${unmeasurable > 0 ? `, and ${unmeasurable} could not be measured at all because no instrument covers that task type` : ""}.`}
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
              label="Patterns checked"
              value={`${evaluated}`}
              sub={`${data.stats.qualityCertified} certified · ${refusedMeasured} refused${noCandidate > 0 ? ` · ${noCandidate} nothing cheaper` : ""}${unmeasurable > 0 ? ` · ${unmeasurable} not measurable` : ""}`}
              accent="oklch(0.82 0.16 155)"
            />
            <HeroStat
              label="Refused on quality"
              value={`${refusedMeasured} candidate${refusedMeasured === 1 ? "" : "s"}`}
              sub="measured against an instrument, and outside the band"
              accent="oklch(0.83 0.13 55)"
            />
            {unmeasurable > 0 ? (
              <HeroStat
                label="Not measurable"
                value={`${unmeasurable} workload${unmeasurable === 1 ? "" : "s"}`}
                sub="no instrument covers this task type, so nothing was tested"
                accent="oklch(0.9 0.03 285)"
              />
            ) : null}

            <HeroStat
              label="Certification rate"
              value={certifiable > 0 ? `${Math.round(certifyRate)}%` : "—"}
              sub={
                certifiable > 0
                  ? "of everything we could actually measure"
                  : "nothing measurable yet"
              }
              accent="oklch(0.9 0.03 285)"
            />

          </>
        }
        aside={
          <>
            <OpportunityRing
              saving={certifyIdentified}
              spend={data.totals.spend}
              period={activeRange.long}
              label="Certified saving"
            />
            <p className="mx-auto mt-4 max-w-[16rem] text-center text-xs text-white/70">
              Cheaper-host and benchmark savings together, each workload counted once, over the
              spend they were found in.
            </p>
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

      <ArbitrageList ctl={ctl} discovery />

      <section>
        <SectionTitle
          eyebrow="List B · benchmark saves"
          title="Cheaper model, same measured quality"
          hint={`Checked against ${data.coverage.evaluations} independent benchmark tests before we recommend the swap.`}
          badge={`${all.length} certified`}
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
            evaluated={data.stats.workloads}
          />
        ) : rows.length === 0 ? (
          <LevelEmpty state={data.dataState} kind="quality_match" />
        ) : (
          <div className="space-y-3">
            {rows.map((row, i) => {
              const key = `quality:${row.fromModel}|${row.toModel}|${row.taskHint}`;
              return (
                <div key={key} className="space-y-2">
                <SwitchCard
                  row={asSwitchRow(row, "quality")}
                  period={activeRange.long}
                  rank={i + 1}
                  discovery
                  discoveryHref={rightsizeHref}
                  /* Dispatch 212: List B disclosed nothing at all before this. */
                  activeSwitch={ctl.pending.activeFrom(row.fromModel, row.fromHost)}
                />
                <WorkloadAlternatives
                  group={groupFor(data.workloadGroups, {
                    fromModel: row.fromModel,
                    fromHost: row.fromHost,
                    taskHint: row.taskHint,
                  })}
                  period={activeRange.long}
                  upsellHref={scope === "demo" ? "/demo/rightsize" : "/workspace/rightsize"}
                />
                </div>
              );
            })}
          </div>
        )}
      </section>

      <NonQualifyingList ctl={ctl} discovery />

      <section className="card-surface p-6">
        <p className="eyebrow">Why some candidates are refused</p>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          {refusedMeasured} candidate{refusedMeasured === 1 ? "" : "s"} on your own traffic cleared
          on price and {refusedMeasured === 1 ? "was" : "were"} still refused, because the measured
          quality gap fell outside the equivalence band for that task class. We would rather show
          you a smaller number we can defend than a larger one we cannot.
        </p>
        {unmeasurable > 0 ? (
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            A further {unmeasurable} workload{unmeasurable === 1 ? "" : "s"} {unmeasurable === 1 ? "was" : "were"}{" "}
            not measured at all: no independent instrument covers that task type on your traffic
            yet, so there was no band to fall outside of. That is a gap in our evidence, not a
            verdict about the model, and it is counted separately for exactly that reason.
          </p>
        ) : null}

        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          This is a different count from Govern&rsquo;s &ldquo;held for you&rdquo;. Refused here
          means the quality claim itself could not be proven. Held on Govern means the switch is
          already certified and only the decision to run it without a human is being withheld, so
          Govern also weighs cheaper-host and oversized candidates that never went through a
          benchmark at all.
        </p>
      </section>


    </>
  );
}
