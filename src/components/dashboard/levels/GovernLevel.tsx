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
  OversizedSection,
  TopSwitchControl,
} from "@/components/dashboard/levels/RightsizeLevel";

import { ExecutionSubtitle } from "@/components/dashboard/ExecutionNote";
import { TransparencyLists } from "@/components/dashboard/TransparencyLists";
import { UsageSection } from "@/components/dashboard/DashboardShell";
import type { DashboardController } from "@/components/dashboard/useDashboardController";
import { usd } from "@/lib/dashboard-data";
import { captureFigures } from "@/lib/dashboard/figures";
import { compositionSentence } from "@/lib/dashboard/composition";
import { governGateEmptyCopy } from "@/lib/dashboard/zero-data-copy";

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
  const capture = captureFigures(savings);
  const mech = mechanismSavings(ctl);
  const govern = data.govern;
  /**
   * Dispatch 187. The cooldown is scoped to one workload — (workspace, model,
   * host) — not to the whole workspace, so this can no longer be a single
   * org-wide "last change" timestamp: one workload being frozen says nothing
   * about the other sixteen. What is shown instead is how many workloads are
   * actually inside their window and when the first of them thaws.
   */
  const cooldownRemainingHours = (() => {
    const endsAt = govern.cooldown.nextEndsAt ? Date.parse(govern.cooldown.nextEndsAt) : null;
    if (endsAt === null) return null;
    const left = endsAt - Date.now();
    return left > 0 ? left / 3_600_000 : null;
  })();


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
          /* Two different sets, never one number: switches already running
             unattended, and new candidates not yet acted on. When there are no
             new candidates left, saying "$0 could have applied itself" next to
             live autonomous switches reads as a contradiction, so the headline
             leads with whichever set is real. */
          govern.eligible.length === 0 && govern.running > 0 ? (
            <>
              <span className="num text-[oklch(0.83_0.11_195)]">
                {govern.running} switch{govern.running === 1 ? "" : "es"}
              </span>{" "}
              <span className="text-white/80">
                already run unattended. No new candidate is waiting.
              </span>
            </>
          ) : (
            <>
              <span className="num text-[oklch(0.83_0.11_195)]">{usd(govern.eligibleSaving)}</span>{" "}
              <span className="text-white/80">
                in new candidates in the {activeRange.long} could apply itself.
              </span>
            </>
          )
        }
        sub={`All three mechanisms run on your traffic, each workload shown once with its alternatives collapsed under the one decision. ${govern.running} switch${govern.running === 1 ? " is" : "es are"} already running unattended from earlier autonomous runs; separately, ${govern.eligible.length} newly certified switch${govern.eligible.length === 1 ? "" : "es"} not yet acted on clear the autonomous gate. ${govern.refusals.length} do not, and will always wait for you — a switch that cannot be proven unattended is never applied unattended. Applied unattended means same-provider swaps today: a switch to a different provider still waits until you allow routing to it, and Bedrock and Vertex are not executed by us at all yet.`}
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
                sub={`saved by ${data.reroutingCount} switch${data.reroutingCount === 1 ? "" : "es"} actually rerouting traffic`}
                accent="oklch(0.82 0.16 155)"
              />
              <HeroStat
                label="Available to activate"
                value={usd(savings.available, 0)}
                sub={`waiting on ${savings.certifiedCount} not-yet-switched workload${savings.certifiedCount === 1 ? "" : "s"} — one certified switch each`}
                accent="oklch(0.83 0.11 195)"
              />

              <MechanismStats mech={mech} />

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

            </HeroStatRow>

            <HeroStatRow title="Govern · what runs without you">
              <HeroStat
                label="Running unattended"
                value={`${govern.running} switch${govern.running === 1 ? "" : "es"}`}
                sub={autonomyOn ? "autonomous mode is on" : "autonomous mode is off"}
                accent="oklch(0.82 0.16 155)"
              />
              <HeroStat
                label="New candidates eligible"
                value={`${govern.eligible.length} switch${govern.eligible.length === 1 ? "" : "es"}`}
                sub={`not yet acted on · ${usd(govern.eligibleSaving, 0)} · ${activeRange.long}`}
                accent="oklch(0.83 0.11 195)"
              />

              <HeroStat
                label="Held for you"
                value={`${govern.refusals.length} switch${govern.refusals.length === 1 ? "" : "es"}`}
                sub="certified across all three mechanisms, held from running unattended — not the same as Certify's quality refusals"
                accent="oklch(0.83 0.13 55)"
              />

              <HeroStat
                label="Minimum to act"
                value={usd(govern.policy.minMonthlySavingUsd, 0)}
                sub={`per switch, per month · a running switch is only given up below ${usd(govern.policy.exitMonthlySavingUsd, 0)}/mo, and a different destination has to beat the one running by ${govern.policy.retargetImprovementPct}%`}
                accent="oklch(0.86 0.09 265)"
              />
              {/* Dispatch 187. The cooldown is per workload, so this tile no
                  longer prints one org-wide "last change": it says how many
                  workloads are inside their own window, which one thaws first,
                  and that the rest are unaffected. */}
              {cooldownRemainingHours !== null ? (
                <HeroStat
                  label="Cooldown remaining"
                  value={
                    cooldownRemainingHours >= 1
                      ? (() => {
                          // Round total minutes first so 1.999h renders
                          // "2h 0m", not "1h 60m" (Phase 5 QA, Jones).
                          const totalMin = Math.round(cooldownRemainingHours * 60);
                          return `${Math.floor(totalMin / 60)}h ${totalMin % 60}m`;
                        })()
                      : `${Math.max(1, Math.round(cooldownRemainingHours * 60))}m`
                  }
                  sub={
                    <>
                      on {govern.cooldown.nextWorkload} · {govern.cooldown.frozen} workload
                      {govern.cooldown.frozen === 1 ? "" : "s"} waiting, every other workload is
                      free to act · thaws <LocalTime iso={govern.cooldown.nextEndsAt!} />
                    </>
                  }
                  accent="oklch(0.9 0.03 285)"
                />
              ) : (
                <HeroStat
                  label="Cooldown policy"
                  value={`${govern.policy.cooldownHours}h`}
                  sub="per workload between unattended changes · no workload is waiting right now"
                  accent="oklch(0.9 0.03 285)"
                />
              )}


            </HeroStatRow>
          </div>
        }
        aside={
          /* The mode control is the point of this level, so it sits in the hero.
             A locked workspace sees the real control, inert — not a description. */
          <div className="w-full max-w-xs space-y-5">
            <div>
              {/* Govern's own numerator: money applied unattended, over what is
                  allowed to run unattended. Not the cross-check capture rate —
                  on a mixed workspace those are different quantities. */}
              <SavingsRing
                captured={govern.captured}
                available={govern.eligibleSaving}
                period={activeRange.long}
                label="Applied unattended"
              />
              <div className="mt-3 flex justify-center gap-5 text-xs text-white/70">
                <Legend color="oklch(0.65 0.15 158)" label="Unattended" />
                <Legend color="oklch(0.72 0.11 195)" label="Eligible" />
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
          hint="Certified, saving enough money to be worth acting on, and outside the waiting period between changes."
          badge={`${usd(govern.eligibleSaving, 0)} · ${activeRange.long}`}
          badgeTone="saving"
        />
        <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
          {compositionSentence(data.composition)}
        </p>
        {govern.eligible.length === 0 ? (
          <div className="card-surface p-6 text-sm text-muted-foreground">
            {governGateEmptyCopy({
              consideredCount: data.composition.consideredCount,
              minMonthlySavingLabel: usd(govern.policy.minMonthlySavingUsd, 0),
            })}
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
                {/* Dispatch 157/159: "cleared the gate" is not the same as
                    "runs unattended today" — and the state sits with the
                    switch it belongs to, not adrift on the card. */}
                <ExecutionSubtitle execution={c.execution} align="right" className="ml-auto" />
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle
          eyebrow="Refusal is the feature"
          title="Held back for a human"
          hint="Cheaper-host, quality-matched and oversized candidates alike: found, priced, certified, and then deliberately not applied unattended. Certify's refusal count is a different set — those never cleared the quality bar in the first place."
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
                  <ExecutionSubtitle execution={r.execution} align="left" className="mt-2" />
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
