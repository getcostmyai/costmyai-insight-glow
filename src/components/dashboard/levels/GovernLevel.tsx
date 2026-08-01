import { ArrowRight, ArrowUpRight, Loader2, ShieldCheck, Zap } from "lucide-react";

import {
  HeroStat,
  HeroStatRow,
  LevelHero,
  Legend,
  LocalTime,
  RangeToggle,
  SectionTitle,
} from "@/components/dashboard/primitives";
import { SavingsRing } from "@/components/dashboard/SavingsRing";
import {
  ActiveSwitchesSection,
  MechanismStats,
  mechanismSavings,
  mechanismSentence,
  OversizedSection,
  TopSwitchControl,
} from "@/components/dashboard/levels/RightsizeLevel";

import { TransparencyLists } from "@/components/dashboard/TransparencyLists";
import { UsageSection } from "@/components/dashboard/DashboardShell";
import type { DashboardController } from "@/components/dashboard/useDashboardController";
import { usd } from "@/lib/dashboard-data";
import { compositionSentence } from "@/lib/dashboard/composition";
import { PLAN_META } from "@/lib/engine/types";

/**
 * Govern — everything Rightsize does, applied without you.
 *
 * It is Rightsize's page plus one new object: the manual/autonomous mode
 * control, which sits in the hero because it is the decision this level is
 * about. The refusals list is given equal weight to the eligible list — a
 * switch that cannot be proven unattended is never applied unattended.
 */
export function GovernLevel({ ctl }: { ctl: DashboardController }) {
  const { data, range, setRange, activeRange, live, canAct, autonomousMutation, errorFor } = ctl;
  const { savings } = data;
  // Both sides are real sums over the same window — like for like on every tab.
  const totalOpportunity = savings.captured + savings.available;
  const captureRate = totalOpportunity > 0 ? savings.captured / totalOpportunity : 0;
  const mech = mechanismSavings(ctl);
  const govern = data.govern;
  const meta = PLAN_META["govern"];
  const autonomyOn = govern.unlocked && govern.enabled;
  const interactive = govern.unlocked && canAct;

  const setMode = (autonomous: boolean) => {
    if (!interactive || autonomous === govern.enabled) return;
    autonomousMutation.mutate(autonomous);
  };

  return (
    <>
      <LevelHero
        eyebrow={
          <>
            <span className="rounded-full bg-white/10 px-2.5 py-1 font-semibold tracking-wide uppercase">
              Level 4 · Govern
            </span>
            <RangeToggle range={range} onChange={setRange} dark />
          </>
        }
        headline={
          <>
            <span className="num text-[oklch(0.83_0.11_195)]">{usd(govern.eligibleSaving)}</span>{" "}
            <span className="text-white/80">
              in the {activeRange.long} could have applied itself.
            </span>
          </>
        }
        sub={`${govern.eligible.length} certified switch${govern.eligible.length === 1 ? "" : "es"} clear the autonomous gate on your traffic. ${govern.refusals.length} do not, and will always wait for you — a switch that cannot be proven unattended is never applied unattended.`}
        stats={
          /* Two bands: everything Rightsize shows, then what autonomy adds.
             Govern is Rightsize plus autonomy, so it must never show less. */
          <div className="col-span-full space-y-8">
            <HeroStatRow title="Rightsize · what is saving and what is waiting">
              <HeroStat
                label={`Spend · ${activeRange.long}`}
                value={usd(live.spend)}
                sub="through the hosts you use today"
                accent="oklch(0.85 0.1 300)"
              />
              <HeroStat
                label="Active saving"
                value={usd(savings.captured, 0)}
                sub={`${data.activeSwitches.length + data.switchesOutsideWindow} switches rerouting traffic`}
                accent="oklch(0.82 0.16 155)"
              />
              <HeroStat
                label="Available to activate"
                value={usd(savings.available, 0)}
                sub={`${savings.certifiedCount} certified switches`}
                accent="oklch(0.83 0.11 195)"
              />
              <MechanismStats mech={mech} />

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
            </HeroStatRow>

            <HeroStatRow title="Govern · what runs without you">
              <HeroStat
                label="Running unattended"
                value={`${govern.running}`}
                sub={autonomyOn ? "autonomous mode is on" : "autonomous mode is off"}
                accent="oklch(0.82 0.16 155)"
              />
              <HeroStat
                label="Eligible now"
                value={`${govern.eligible.length}`}
                sub={`${usd(govern.eligibleSaving, 0)} · ${activeRange.long}`}
                accent="oklch(0.83 0.11 195)"
              />
              <HeroStat
                label="Held for you"
                value={`${govern.refusals.length}`}
                sub="refused by the autonomous gate"
                accent="oklch(0.83 0.13 55)"
              />
              <HeroStat
                label="Minimum to act"
                value={usd(govern.policy.minMonthlySavingUsd, 0)}
                sub="per switch, per month"
                accent="oklch(0.86 0.09 265)"
              />
              <HeroStat
                label="Cooldown"
                value={`${govern.policy.cooldownHours}h`}
                sub={
                  govern.lastAutonomousAt ? (
                    <>
                      last change <LocalTime iso={govern.lastAutonomousAt} />
                    </>
                  ) : (
                    "no autonomous change yet"
                  )
                }
                accent="oklch(0.9 0.03 285)"
              />
            </HeroStatRow>
          </div>
        }
        aside={
          /* The mode control is the point of this level, so it sits in the hero.
             A locked workspace sees the real control, inert — not a description. */
          <div className="w-full max-w-xs space-y-5">
            <div>
              <SavingsRing
                captured={savings.captured}
                available={savings.available}
                period={activeRange.long}
              />
              <div className="mt-3 flex justify-center gap-5 text-xs text-white/70">
                <Legend color="oklch(0.65 0.15 158)" label="Captured" />
                <Legend color="oklch(0.72 0.11 195)" label="Available" />
              </div>
            </div>
            <div className="rounded-3xl bg-white/10 p-5 backdrop-blur">
              <div className="flex items-center gap-3">
                <span
                  className={`flex size-10 items-center justify-center rounded-2xl ${
                    autonomyOn
                      ? "bg-[oklch(0.82_0.16_155)]/20 text-[oklch(0.86_0.16_155)]"
                      : "bg-white/10 text-white/70"
                  }`}
                >
                  <ShieldCheck className="size-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">Switching mode</p>
                  <p className="text-[11px] text-white/60">
                    {autonomyOn
                      ? "Applying certified switches for you"
                      : "You approve every switch"}
                  </p>
                </div>
              </div>

              <div
                role="radiogroup"
                aria-label="Switching mode"
                className="mt-4 grid grid-cols-2 gap-1 rounded-full bg-black/25 p-1 text-xs font-semibold"
              >
                {(
                  [
                    ["Manual", false],
                    ["Autonomous", true],
                  ] as const
                ).map(([label, value]) => {
                  const on = govern.enabled === value;
                  return (
                    <button
                      key={label}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      disabled={!interactive || autonomousMutation.isPending}
                      onClick={() => setMode(value)}
                      className={`inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2 transition-colors ${
                        on
                          ? "bg-white text-[oklch(0.22_0.07_285)]"
                          : "text-white/70 hover:text-white disabled:hover:text-white/70"
                      } ${interactive ? "" : "cursor-not-allowed"}`}
                    >
                      {autonomousMutation.isPending && !on ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : null}
                      {label}
                    </button>
                  );
                })}
              </div>

              <p className="mt-3 text-[11px] leading-relaxed text-white/60">
                {govern.unlocked
                  ? "In autonomous mode, certified switches that clear the gate are applied as prices and benchmarks move — within three minutes of a price change, once a day for a benchmark change. Every switch stays reversible."
                  : `Autonomous mode is part of ${meta.label}. The gate below has already run against your traffic — turning it on is all that is missing.`}
              </p>
              {errorFor("autonomous") ? (
                <p className="mt-2 text-[11px] text-[oklch(0.8_0.15_25)]">
                  {errorFor("autonomous")}
                </p>
              ) : null}
              {govern.unlocked ? null : (
                <a
                  href="/pricing"
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-white"
                >
                  Upgrade to {meta.label}
                  <ArrowUpRight className="size-3.5" />
                </a>
              )}
            </div>
          </div>
        }
      >
        <TopSwitchControl ctl={ctl} />
      </LevelHero>

      <UsageSection ctl={ctl} />

      {/* Govern is Rightsize plus autonomy — the same evidence, same controls. */}
      <TransparencyLists ctl={ctl} />
      <OversizedSection ctl={ctl} />
      <ActiveSwitchesSection ctl={ctl} />

      <section>
        <SectionTitle
          eyebrow="Would run without you"
          title="Cleared by the autonomous gate"
          hint="Certified, above the materiality floor, and outside the cooldown window."
          badge={`${usd(govern.eligibleSaving, 0)} · ${activeRange.long}`}
          badgeTone="saving"
        />
        <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
          {compositionSentence(data.composition)}
        </p>
        {govern.eligible.length === 0 ? (
          <div className="card-surface p-6 text-sm text-muted-foreground">
            Nothing currently clears the gate. That is a real answer, not an empty state — every
            candidate either fell below {usd(govern.policy.minMonthlySavingUsd, 0)}/mo or could not
            be certified.
          </div>
        ) : (
          <div className="space-y-3">
            {govern.eligible.map((c) => (
              <div
                key={`${c.kind}:${c.fromModel}|${c.toModel}|${c.taskHint}`}
                className="card-surface flex flex-wrap items-center gap-x-6 gap-y-3 p-5"
              >
                <span className="inline-flex items-center gap-1.5 rounded-full bg-saving-soft px-2.5 py-1 text-[10px] font-bold tracking-wider text-saving uppercase">
                  <Zap className="size-3" />
                  {c.kind.replace("_", " ")}
                </span>
                <div className="flex min-w-60 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-mono text-sm text-muted-foreground line-through decoration-muted-foreground/40">
                    {c.fromModel}
                  </span>
                  <ArrowRight className="size-3.5 text-primary" />
                  <span className="font-mono text-sm font-semibold text-primary">{c.toModel}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {c.toHost} · {c.taskHint}
                  </span>
                </div>
                <span className="num text-lg text-saving">{usd(c.saving, 0)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle
          eyebrow="Refusal is the feature"
          title="Held back for a human"
          hint="These were found, priced, and then deliberately not applied unattended."
          badge={`${govern.refusals.length} held`}
          badgeTone="opportunity"
        />
        {govern.refusals.length === 0 ? (
          <div className="card-surface p-6 text-sm text-muted-foreground">
            Nothing was held back this run.
          </div>
        ) : (
          <div className="card-surface divide-y divide-border overflow-hidden">
            {govern.refusals.map((r) => (
              <div
                key={`${r.kind}:${r.fromModel}|${r.toModel}|${r.taskHint}`}
                className="flex flex-wrap items-center gap-x-6 gap-y-2 p-5"
              >
                <div className="min-w-60 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-mono text-sm text-muted-foreground">{r.fromModel}</span>
                    <ArrowRight className="size-3.5 text-muted-foreground" />
                    <span className="font-mono text-sm">{r.toModel}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{r.detail}</p>
                </div>
                <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  {r.reason.replace(/_/g, " ")}
                </span>
                <span className="num text-sm text-muted-foreground">
                  {usd(r.saving, 0)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
