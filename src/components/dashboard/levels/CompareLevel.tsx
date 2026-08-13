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
} from "@/components/dashboard/LevelState";
import type { DashboardController } from "@/components/dashboard/useDashboardController";
import { usd } from "@/lib/dashboard-data";
import { levelCount, levelSaving } from "@/lib/dashboard/figures";


/**
 * Compare — same model, cheaper host. The free level.
 *
 * The claim here carries no quality risk at all: identical weights, a
 * different provider. So the hero leads with coverage (how much of your spend
 * is already on its cheapest host) rather than with quality evidence, which
 * belongs to Certify. Nothing on this page describes a switch already running:
 * activating is a paid action and belongs to Rightsize and Govern.
 */
export function CompareLevel({ ctl }: { ctl: DashboardController }) {
  const {
    data,
    range,
    setRange,
    activeRange,
    live,
    rightsizeHref,
    scope,
  } = ctl;
  const level = data.levels.host_arbitrage;
  const certify = data.levels.quality_match;
  const rows = data.hostArbitrage;

  // One number, one source: the controller's shared live counter. The hero and
  // the gateway usage widget below read the same object, so they cannot drift
  // apart by a cent the way two independent tickers did.
  const windowSpend = live.spend;
  /**
   * Dispatch 170. Ratios divide by the *measured* window spend, never the live
   * counter. `live.spend` accrues forward between refetches at the window's
   * average rate — fine for a disclosed ticking counter, wrong as the
   * denominator of a percentage whose numerator is a fixed server figure: the
   * ring would drift downward every 1.8s on spend nobody observed.
   */
  const measuredSpend = data.totals.spend;
  // Real dollars over the window on screen. Both sides of every ratio below are
  // the same window, so a shorter tab can never report more money than a longer one.
  const available = levelSaving(data, "host_arbitrage");
  const bestPct = rows.length > 0 ? Math.max(...rows.map((r) => r.savingPct)) : 0;
  // Everything the arbitrage check did not flag is already on a host we cannot beat.
  const onCheapestHost = Math.max(0, measuredSpend - available);
  // Dispatch 172. With no measured spend there is no coverage to report. The
  // old fallback printed "100% of your spend already optimal" to a workspace we
  // had priced nothing for, which is a claim of optimality made from zero
  // evidence. Absence of data is rendered as absence of data.
  const coveragePct = measuredSpend > 0 ? (onCheapestHost / measuredSpend) * 100 : null;

  const certifySaving = levelSaving(data, "quality_match");
  const certifyCount = levelCount(data, "quality_match");

  return (
    <>
      <LevelHero
        eyebrow={
          <>
            <span className="rounded-full bg-white/10 px-2.5 py-1 font-semibold tracking-wide uppercase">
              Level 1 · Compare · free
            </span>
            <RangeToggle range={range} onChange={setRange} dark />
          </>
        }
        headline={
          <>
            The same model,{" "}
            <span className="num text-[oklch(0.83_0.11_195)]">{usd(available)}</span>{" "}
            <span className="text-white/80">cheaper in the {activeRange.long}.</span>
          </>
        }
        sub={`Identical model weights on a different provider. No benchmark is needed — the output is the same model's output. Every figure on this page is a real sum over the ${activeRange.long}, not a projection.`}
        stats={
          <>
            <HeroStat
              label={`Spend · ${activeRange.long}`}
              value={usd(windowSpend)}
              sub="through the hosts you use today"
              accent="oklch(0.85 0.1 300)"
            />
            <HeroStat
              label="Cheaper hosts identified"
              value={`${rows.length}`}
              sub="identical weights, zero quality risk"
              accent="oklch(0.83 0.11 195)"
            />
            <HeroStat
              label={`Available · ${activeRange.long}`}
              value={usd(available, 0)}
              sub="what moving to those hosts would have saved"
              accent="oklch(0.82 0.16 155)"
            />
            <HeroStat
              label="Best single saving"
              value={bestPct > 0 ? `${bestPct.toFixed(0)}%` : "—"}
              sub={bestPct > 0 ? "on one workload's host swap" : "nothing left to move"}
              accent="oklch(0.86 0.09 265)"
            />
            <HeroStat
              label="On cheapest host"
              value={coveragePct === null ? "—" : `${Math.round(coveragePct)}%`}
              sub={
                coveragePct === null
                  ? "not enough priced traffic yet to judge"
                  : "of your spend already optimal"
              }
              accent="oklch(0.9 0.03 285)"
            />

          </>
        }
        aside={
          <>
            <OpportunityRing
              saving={available}
              spend={measuredSpend}
              period={activeRange.long}
              label="Cheaper hosts"
            />
            <p className="mx-auto mt-4 max-w-[16rem] text-center text-xs text-white/70">
              Share of your spend the cheaper-host check found money in. Acting on it is a
              Rightsize action.
            </p>
          </>
        }
      />


      <HeroUpsell
        to={scope === "demo" ? "/demo/certify" : "/workspace/certify"}
        requiredPlan="certify"
        count={certifyCount}
        saving={certifySaving}
        period={activeRange.long}
        what="workload"
        unlocked={certify.unlocked}
      />

      <UsageSection ctl={ctl} />

      <section>
        <SectionTitle
          eyebrow={`Ranked by saving · ${activeRange.long}`}
          title="Same model, cheaper host"
          hint="Identical model weights, a cheaper provider. Zero quality risk."
          badge={`${rows.length} certified`}
          badgeTone="saving"
        />
        {!level.unlocked ? (
          <LevelLocked
            requiredPlan={level.requiredPlan}
            count={level.lockedCount}
            saving={level.lockedSaving}
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
              return (
                <SwitchCard
                  key={key}
                  row={asSwitchRow(row, "host")}
                  period={activeRange.long}
                  rank={i + 1}
                  discovery
                  discoveryHref={rightsizeHref}
                  /* Dispatch 212: disclose the workload's running switch here too. */
                  activeSwitch={ctl.pending.activeFrom(row.fromModel, row.fromHost)}
                />
              );
            })}
          </div>
        )}
      </section>

    </>
  );
}
