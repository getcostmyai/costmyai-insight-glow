import { ArrowRight, ArrowUpRight, Loader2, ShieldCheck, ShieldOff, Zap } from "lucide-react";

import { HeroStat, LevelHero, LocalTime, RangeToggle, SectionTitle } from "@/components/dashboard/primitives";
import type { DashboardController } from "@/components/dashboard/useDashboardController";
import { usd } from "@/lib/dashboard-data";
import { PLAN_META } from "@/lib/engine/types";

/**
 * Govern — everything Rightsize does, applied without you.
 *
 * Structurally this mirrors Rightsize on purpose: the same money, the same
 * switches. The one new object is the autonomous toggle, and the one new
 * question is which of those switches are safe to run unattended — which is
 * why the refusals list is given equal weight to the eligible list. A locked
 * workspace sees the real toggle, inert, with its real numbers behind it.
 */
export function GovernLevel({ ctl }: { ctl: DashboardController }) {
  const { data, range, setRange, canAct, autonomousMutation, errorFor } = ctl;
  const govern = data.govern;
  const meta = PLAN_META["govern"];
  const live = govern.unlocked && govern.enabled;

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
            <span className="num text-[oklch(0.83_0.11_195)]">{usd(govern.eligibleMonthly)}</span>{" "}
            <span className="text-white/80">a month could apply itself.</span>
          </>
        }
        sub={`${govern.eligible.length} certified switch${govern.eligible.length === 1 ? "" : "es"} clear the autonomous gate on your traffic. ${govern.refusals.length} do not, and will always wait for you — a switch that cannot be proven unattended is never applied unattended.`}
        stats={
          <>
            <HeroStat
              label="Running unattended"
              value={`${govern.running}`}
              sub={live ? "autonomous mode is on" : "autonomous mode is off"}
              accent="oklch(0.82 0.16 155)"
            />
            <HeroStat
              label="Eligible now"
              value={`${govern.eligible.length}`}
              sub={`${usd(govern.eligibleMonthly, 0)}/mo`}
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
          </>
        }
      />

      {/* The toggle is always rendered — locked workspaces see the real control,
          disabled, rather than a description of a control they cannot see. */}
      <section
        className={`card-surface flex flex-wrap items-center gap-5 p-6 ${
          govern.unlocked ? "" : "border-primary/25"
        }`}
      >
        <span
          className={`flex size-12 items-center justify-center rounded-2xl ${
            live ? "bg-saving-soft text-saving" : "bg-muted text-muted-foreground"
          }`}
        >
          {live ? <ShieldCheck className="size-6" /> : <ShieldOff className="size-6" />}
        </span>
        <div className="min-w-60 flex-1">
          <p className="text-sm font-semibold">Autonomous switching</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {govern.unlocked
              ? "When this is on, certified switches that clear the gate are applied as prices and benchmarks move — within three minutes of a price change, once a day for a benchmark change. Every switch stays reversible."
              : `Autonomous switching is part of ${meta.label}. The gate below has already run against your traffic — turning it on is all that is missing.`}
          </p>
          {errorFor("autonomous") ? (
            <p className="mt-2 text-xs text-destructive">{errorFor("autonomous")}</p>
          ) : null}
        </div>

        {govern.unlocked && canAct ? (
          <button
            type="button"
            role="switch"
            aria-checked={govern.enabled}
            disabled={autonomousMutation.isPending}
            onClick={() => autonomousMutation.mutate(!govern.enabled)}
            className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-transform active:scale-95 disabled:opacity-60 ${
              govern.enabled
                ? "border border-border text-muted-foreground hover:text-foreground"
                : "bg-primary text-primary-foreground shadow-[var(--shadow-glow)]"
            }`}
          >
            {autonomousMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            {govern.enabled ? "Turn autonomous off" : "Turn autonomous on"}
          </button>
        ) : (
          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              role="switch"
              aria-checked={false}
              disabled
              className="inline-flex cursor-not-allowed items-center gap-2 rounded-full bg-muted px-5 py-2.5 text-sm font-semibold text-muted-foreground"
            >
              Turn autonomous on
            </button>
            <a
              href="/pricing"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary"
            >
              {govern.unlocked ? "Open your own workspace" : `Upgrade to ${meta.label}`}
              <ArrowUpRight className="size-3.5" />
            </a>
          </div>
        )}
      </section>

      <section>
        <SectionTitle
          eyebrow="Would run without you"
          title="Cleared by the autonomous gate"
          hint="Certified, above the materiality floor, and outside the cooldown window."
          badge={`${usd(govern.eligibleMonthly, 0)}/mo`}
          badgeTone="saving"
        />
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
                <span className="num text-lg text-saving">{usd(c.monthlySaving, 0)}/mo</span>
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
                  {usd(r.monthlySaving, 0)}/mo
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
