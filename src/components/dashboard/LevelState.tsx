import { ArrowUpRight, Clock, Lock, PlugZap, ShieldCheck, Sparkles } from "lucide-react";

import { emptyCopy, type DataState } from "@/lib/dashboard/onboarding";
import { OBJECTIVE_OPTIONS } from "@/lib/dashboard/objective";
import { usd } from "@/lib/dashboard-data";
import type { ObjectiveKind, PlanTier, RecKind } from "@/lib/engine/types";
import { PLAN_META } from "@/lib/engine/types";

/**
 * The three things a level can show when it has no rows for you: a real result,
 * a paywall, or a setup step. They are deliberately different objects — a
 * workspace with no traffic must never be told its check came back clean.
 */
export function LevelEmpty({ state, kind }: { state: DataState; kind: RecKind }) {
  const copy = emptyCopy(state, kind);
  const waiting = copy.tone === "waiting";
  const Icon = state === "awaiting_first_event" ? PlugZap : waiting ? Clock : ShieldCheck;
  return (
    <div
      className={`flex items-start gap-4 rounded-2xl border p-5 ${
        waiting
          ? "border-dashed border-primary/30 bg-primary-soft/40"
          : "border-saving/20 bg-saving-soft"
      }`}
    >
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
          waiting ? "bg-primary/10 text-primary" : "bg-saving/10 text-saving"
        }`}
      >
        <Icon className="size-5" />
      </span>
      <div>
        <p className={`text-sm font-semibold ${waiting ? "text-primary" : "text-saving"}`}>
          {copy.title}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{copy.body}</p>
      </div>
    </div>
  );
}

/**
 * A locked level. The count and the money are the engine's real output over the
 * workspace's real traffic — only the row detail is withheld.
 */
export function LevelLocked({
  requiredPlan,
  count,
  saving,
  period,
  what,
}: {
  requiredPlan: PlanTier;
  count: number;
  /** Real money behind the lock over the window on screen. */
  saving: number;
  period: string;
  what: string;
}) {
  const meta = PLAN_META[requiredPlan];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/25 bg-card p-6">
      <div
        className="pointer-events-none absolute -top-16 -right-10 size-56 rounded-full opacity-30 blur-3xl"
        style={{ background: "var(--gradient-spend)" }}
      />
      <div className="relative flex flex-wrap items-center gap-6">
        <span className="flex size-11 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <Lock className="size-5" />
        </span>
        <div className="min-w-52 flex-1">
          <p className="text-sm font-semibold">
            {count === 0
              ? `This check found nothing to ${what} in this window`
              : `${count} ${what} finding${count === 1 ? "" : "s"} on your traffic`}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {meta.label} unlocks the detail. {meta.blurb} We ran the check anyway — the number
            beside it is measured, not an estimate.
          </p>
        </div>
        <div className="text-right">
          <div className="num text-3xl text-primary blur-[0.5px] select-none">
            {usd(saving, 0)}
          </div>
          <p className="text-[11px] text-muted-foreground">
            behind this level · {period}
          </p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-transform hover:scale-[1.02] active:scale-95">
          <Sparkles className="size-4" />
          Unlock {meta.label}
        </button>
      </div>
    </div>
  );
}

/** Clause 07 selector. Only meaningful where the quality check itself exists. */
export function ObjectiveSelect({
  value,
  onChange,
  locked,
  requiredPlan,
}: {
  value: ObjectiveKind;
  onChange: (v: ObjectiveKind) => void;
  locked: boolean;
  requiredPlan: PlanTier;
}) {
  const active = OBJECTIVE_OPTIONS.find((o) => o.key === value) ?? OBJECTIVE_OPTIONS[0];
  return (
    <div className="flex flex-col items-start gap-1.5 sm:items-end">
      <div className="flex items-center gap-2">
        <span className="eyebrow">Optimising for</span>
        {locked && <Lock className="size-3 text-muted-foreground" />}
      </div>
      <div className="flex gap-1 rounded-full bg-muted p-1 text-xs font-medium">
        {OBJECTIVE_OPTIONS.map((o) => {
          const on = o.key === value && !locked;
          return (
            <button
              key={o.key}
              disabled={locked}
              onClick={() => onChange(o.key)}
              aria-pressed={on}
              className={`rounded-full px-3 py-1.5 transition-colors ${
                on
                  ? "bg-card text-primary shadow-[var(--shadow-card)]"
                  : locked
                    ? "cursor-not-allowed text-muted-foreground/50"
                    : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      <p className="max-w-xs text-[11px] text-muted-foreground sm:text-right">
        {locked ? `Objective selection starts on ${PLAN_META[requiredPlan].label}.` : active.hint}
      </p>
    </div>
  );
}

/**
 * The next level's real, already-computed finding — shown on the level below it.
 *
 * The count and the money come from the same engine run the next level's own
 * page renders, so this is never marketing copy: it is that page's number,
 * quoted one level early.
 */
export function NextLevelUpsell({
  to,
  requiredPlan,
  count,
  saving,
  period,
  what,
  unlocked,
}: {
  to: string;
  requiredPlan: PlanTier;
  count: number;
  saving: number;
  period: string;
  what: string;
  unlocked: boolean;
}) {
  const meta = PLAN_META[requiredPlan];
  if (count === 0 && saving === 0) return null;
  return (
    <a
      href={to}
      className="card-surface group flex flex-wrap items-center gap-5 border-primary/25 p-5 transition-transform hover:-translate-y-0.5"
    >
      <span className="flex size-11 items-center justify-center rounded-2xl bg-primary-soft text-primary">
        <Sparkles className="size-5" />
      </span>
      <div className="min-w-60 flex-1">
        <p className="text-sm font-semibold">
          {count} {what}
          {count === 1 ? "" : "s"} could unlock a further{" "}
          <span className="num text-saving">{usd(saving, 0)}</span> in the {period}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Found by the {meta.label} check, already run against your traffic.{" "}
          {unlocked
            ? "Open the level to see the evidence."
            : `${meta.label} shows each one in full.`}
        </p>
      </div>
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
        {unlocked ? `Open ${meta.label}` : `See what ${meta.label} found`}
        <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </a>
  );
}

/**
 * The same next-level finding as `NextLevelUpsell`, but sized for the top of
 * the page: a prospect scrolling for two seconds must see the money the next
 * level already found on their own traffic, not a sentence at the bottom.
 */
export function HeroUpsell({
  to,
  requiredPlan,
  count,
  saving,
  period,
  what,
  unlocked,
}: {
  to: string;
  requiredPlan: PlanTier;
  count: number;
  saving: number;
  period: string;
  what: string;
  unlocked: boolean;
}) {
  const meta = PLAN_META[requiredPlan];
  if (count === 0 && saving === 0) return null;
  return (
    <a
      href={to}
      className="group relative flex flex-wrap items-center gap-6 overflow-hidden rounded-3xl border border-primary/30 bg-primary-soft/60 p-6 transition-transform hover:-translate-y-0.5 sm:p-7"
    >
      <div
        className="pointer-events-none absolute -top-20 -right-10 size-72 rounded-full opacity-30 blur-3xl"
        style={{ background: "var(--gradient-saving)" }}
      />
      <span className="relative flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[var(--shadow-glow)]">
        <Sparkles className="size-6" />
      </span>
      <div className="relative min-w-60 flex-1">
        <p className="eyebrow text-primary">Already found on your traffic · {meta.label}</p>
        <p className="num mt-1 text-3xl text-saving sm:text-4xl">
          {usd(saving, 0)}
          <span className="text-base text-muted-foreground"> · {period}</span>
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          across {count} {what}
          {count === 1 ? "" : "s"} the {meta.label} check has already scored.{" "}
          {unlocked
            ? "Open the level to see the evidence."
            : `${meta.label} shows each one in full.`}
        </p>
      </div>
      <span className="relative inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)]">
        {unlocked ? `Open ${meta.label}` : `Unlock ${meta.label}`}
        <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </a>
  );
}
