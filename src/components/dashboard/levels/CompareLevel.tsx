import { HeroStat, LevelHero, RangeToggle, SectionTitle, asSwitchRow } from "@/components/dashboard/primitives";
import { UsageSection } from "@/components/dashboard/DashboardShell";
import { SwitchCard } from "@/components/dashboard/SwitchCard";
import { LevelEmpty, LevelLocked } from "@/components/dashboard/LevelState";
import type { DashboardController } from "@/components/dashboard/useDashboardController";
import { usd } from "@/lib/dashboard-data";
import { useLiveTotals } from "@/lib/gateway-metrics";

/**
 * Compare — same model, cheaper host. The free level.
 *
 * The claim here carries no quality risk at all: identical weights, a
 * different provider. So the hero leads with coverage (how much of your spend
 * is already on its cheapest host) rather than with quality evidence, which
 * belongs to Certify.
 */
export function CompareLevel({ ctl }: { ctl: DashboardController }) {
  const { data, range, setRange, activeRange, canAct, activate, busy, errorFor, ctaHref, ctaLabel } =
    ctl;
  const { live } = useLiveTotals(range, data.series, data.totals, data.generatedAt);
  const level = data.levels.host_arbitrage;
  const rows = data.hostArbitrage;

  const availableMonthly = rows.reduce((s, r) => s + r.monthlySaving, 0);
  const capturedMonthly = data.activeSwitches
    .filter((s) => s.badge !== "Quality-matched")
    .reduce((s, a) => s + a.monthlyRate, 0);
  const bestPct = rows.length > 0 ? Math.max(...rows.map((r) => r.savingPct)) : 0;
  // Everything the arbitrage check did not flag is already on a host we cannot beat.
  const onCheapestHost = Math.max(0, live.spend - availableMonthly);
  const coveragePct = live.spend > 0 ? (onCheapestHost / live.spend) * 100 : 100;

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
            <span className="num text-[oklch(0.83_0.11_195)]">{usd(availableMonthly)}</span>{" "}
            <span className="text-white/80">a month cheaper.</span>
          </>
        }
        sub="Identical model weights on a different provider. No benchmark is needed to justify this switch — the output is the same model's output."
        stats={
          <>
            <HeroStat
              label={`Spend · ${activeRange.long}`}
              value={usd(live.spend)}
              sub="through the hosts you use today"
              accent="oklch(0.85 0.1 300)"
            />
            <HeroStat
              label="Cheaper-host switches"
              value={`${rows.length}`}
              sub="certified, zero quality risk"
              accent="oklch(0.83 0.11 195)"
            />
            <HeroStat
              label="Available monthly"
              value={usd(availableMonthly, 0)}
              sub="if you activate all of them"
              accent="oklch(0.82 0.16 155)"
            />
            <HeroStat
              label="Already captured"
              value={usd(capturedMonthly, 0)}
              sub="running through cheaper hosts now"
              accent="oklch(0.86 0.09 265)"
            />
            <HeroStat
              label="On cheapest host"
              value={`${Math.round(coveragePct)}%`}
              sub={bestPct > 0 ? `best single saving ${bestPct.toFixed(0)}%` : "nothing left to move"}
              accent="oklch(0.9 0.03 285)"
            />
          </>
        }
      />

      <UsageSection ctl={ctl} />

      <section>
        <SectionTitle
          eyebrow="Ranked by monthly saving"
          title="Same model, cheaper host"
          hint="Identical model weights, a cheaper provider. Zero quality risk."
          badge={`${rows.length} certified`}
          badgeTone="saving"
        />
        {!level.unlocked ? (
          <LevelLocked
            requiredPlan={level.requiredPlan}
            count={level.lockedCount}
            monthly={level.lockedMonthly}
            what="cheaper-host"
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
    </>
  );
}
