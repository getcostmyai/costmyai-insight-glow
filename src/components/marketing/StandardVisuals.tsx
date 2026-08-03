import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Coins, FileCheck2, Gauge, ShieldCheck } from "lucide-react";

import { Reveal } from "@/components/marketing/Reveal";
import type { BandWinner } from "@/lib/intelligence/intelligence.server";

/**
 * Visual grammar for /standard — the framework page.
 *
 * Same restraint as the Intelligence page: hairline rails, one accent (purple),
 * numbers as the main character, no boxed-in filler. Everything here is
 * presentational; the rung definitions are the single source below.
 */

export interface Rung {
  n: number;
  key: string;
  name: string;
  requirement: string;
  proof: string;
  proofDetail: string;
  plan: string;
}

export const RUNGS: Rung[] = [
  {
    n: 1,
    key: "compare",
    name: "Compare",
    requirement:
      "The exact same model, rented from a cheaper host. Identical weights, so quality cannot change.",
    proof: "Model + price",
    proofDetail:
      "We know exactly which model you run, and the live per-token price at every host serving those same weights.",
    plan: "Free",
  },
  {
    n: 2,
    key: "certify",
    name: "Certify",
    requirement:
      "A different, cheaper model. Allowed only when its benchmark score is close enough to the best model that the test cannot tell them apart.",
    proof: "Benchmark + margin",
    proofDetail:
      "An independent test score for this kind of task, plus how far that test can be off. No error margin, no claim.",
    plan: "Paid",
  },
  {
    n: 3,
    key: "rightsize",
    name: "Rightsize",
    requirement:
      "You are paying for a model bigger than the job needs. We spot it in your real traffic, you approve the switch.",
    proof: "Token + complexity profile",
    proofDetail:
      "Your measured input and output token mix and how hard the tasks actually are, per workload. Not a guess from a price list.",
    plan: "Paid",
  },
  {
    n: 4,
    key: "govern",
    name: "Govern",
    requirement:
      "Approved switches happen on their own, and undo themselves the moment the evidence stops holding.",
    proof: "Full evidence trail",
    proofDetail:
      "Every automatic action stores the price, the score, the error margin and the condition that would reverse it.",
    plan: "Paid",
  },
];


const PROOF_ICONS = {
  compare: Coins,
  certify: FileCheck2,
  rightsize: Gauge,
  govern: ShieldCheck,
} as const;

/* ---------------------------------------------------------------------------
 * The hero visual: four levels as an ascending stack, each with its one-line
 * requirement attached directly to the level rather than listed underneath.
 * ------------------------------------------------------------------------- */

export function RungStack() {
  return (
    <div className="flex flex-col-reverse gap-3">
      {RUNGS.map((r, i) => {
        // Ascending structure: rung 1 is the widest base, rung 4 the apex.
        const width = 100 - (r.n - 1) * 4;
        const strength = 0.05 + r.n * 0.045;
        return (
          <Reveal key={r.key} delay={(RUNGS.length - i) * 70}>
            <div
              className="grid items-center gap-4 rounded-2xl px-5 py-6 sm:grid-cols-[auto_10rem_minmax(0,1fr)_auto] sm:gap-7 sm:px-8"
              style={{
                width: `${width}%`,
                background: `color-mix(in oklab, var(--primary) ${strength * 100}%, transparent)`,
              }}
            >
              <span className="num text-3xl font-semibold tabular-nums tracking-[-0.05em] text-primary/70 sm:text-4xl">
                {String(r.n).padStart(2, "0")}
              </span>
              <span className="text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">
                {r.name}
              </span>
              <span className="text-[0.95rem] leading-relaxed text-muted-foreground">
                {r.requirement}
              </span>
              <span className="justify-self-start text-[0.7rem] font-medium uppercase tracking-[0.14em] text-muted-foreground/80 sm:justify-self-end">
                {r.plan}
              </span>
            </div>
          </Reveal>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * What each rung has to prove — one row per rung, icon-led, side by side.
 * ------------------------------------------------------------------------- */

export function ProofMatrix() {
  return (
    <ul className="grid gap-px overflow-hidden rounded-2xl bg-border/70 sm:grid-cols-2 lg:grid-cols-4">
      {RUNGS.map((r, i) => {
        const Icon = PROOF_ICONS[r.key as keyof typeof PROOF_ICONS];
        return (
          <li key={r.key} className="bg-background">
            <Reveal delay={i * 60} className="flex h-full flex-col p-7">
              <span className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary">
                <Icon className="size-[18px]" />
              </span>
              <p className="mt-6 text-[0.7rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Rung {r.n} · {r.name}
              </p>
              <p className="mt-2 text-xl font-semibold tracking-[-0.03em]">{r.proof}</p>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{r.proofDetail}</p>
            </Reveal>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------------------------------------------------------------------------
 * Two-question self-assessment. Deterministic: the answers map to the highest
 * rung the reader can actually evidence today.
 * ------------------------------------------------------------------------- */

interface Question {
  id: "attribution" | "evidence";
  prompt: string;
  options: { value: string; label: string }[];
}

const QUESTIONS: Question[] = [
  {
    id: "attribution",
    prompt:
      "Can you say what last month's AI bill was spent on, feature by feature and model by model, without logging into a provider dashboard?",
    options: [
      { value: "yes", label: "Yes, it is one query away" },
      { value: "partly", label: "Partly: I know the total, not the split" },
      { value: "no", label: "No, I would have to go digging" },
    ],
  },
  {
    id: "evidence",
    prompt: "Was your last model change based on a test result, or on a hunch?",
    options: [
      { value: "benchmark", label: "A benchmark, with a stated error margin" },
      { value: "vibes", label: "A quick leaderboard look or a team opinion" },
      { value: "none", label: "We have not changed a model yet" },
    ],
  },
];

interface Verdict {
  rung: number | 0;
  title: string;
  body: string;
  cta: { to: string; label: string };
}

function verdictFor(attribution: string, evidence: string): Verdict {
  if (attribution === "no") {
    return {
      rung: 0,
      title: "Below rung one",
      body: "If you cannot see which feature spent what, there is nothing to compare yet, so no saving can be proven. Start by measuring spend request by request. Everything above this rung depends on it.",
      cta: { to: "/pricing", label: "See what the free level covers" },
    };
  }
  if (attribution === "partly") {
    return {
      rung: 1,
      title: "Rung 1 — Compare",
      body: "You can see the bill, but not yet split it cleanly. Same-model host switches are already open to you: identical model, cheaper host, no quality risk, and only the price to check.",
      cta: { to: "/models", label: "Browse the live price catalog" },
    };
  }
  if (evidence === "benchmark") {
    return {
      rung: 3,
      title: "Rung 3 — Rightsize",
      body: "You can see where the money goes and your last change had evidence behind it, so swapping models is already realistic. The open question is whether your models are simply bigger than the work needs, which your token traffic answers, not the price list.",
      cta: { to: "/pricing", label: "See the Rightsize level" },
    };
  }
  return {
    rung: 2,
    title: "Rung 2 — Certify",
    body: "You can see where the money goes, but your last model change rested on an opinion rather than a measured result. Certify is the next step: the cheapest model that still scores close enough to the leader, and an honest no when none does.",
    cta: { to: "/legal/methodology", label: "Read how the bar is set" },
  };
}


export function RungSelfAssessment() {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const complete = QUESTIONS.every((q) => answers[q.id]);
  const verdict = complete ? verdictFor(answers.attribution!, answers.evidence!) : null;

  return (
    <div>
      <ol className="divide-y divide-border/60 border-y border-border/60">
        {QUESTIONS.map((q, i) => (
          <li key={q.id} className="grid gap-6 py-10 sm:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] sm:gap-12">
            <div className="flex items-start gap-5">
              <span className="num select-none text-3xl font-semibold tabular-nums tracking-[-0.05em] text-muted-foreground/25">
                {String(i + 1).padStart(2, "0")}
              </span>
              <p className="text-xl font-semibold leading-snug tracking-[-0.025em] sm:text-2xl">
                {q.prompt}
              </p>
            </div>
            <div className="flex flex-col gap-2 self-center">
              {q.options.map((o) => {
                const active = answers[q.id] === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setAnswers((a) => ({ ...a, [q.id]: o.value }))}
                    className={`rounded-full px-5 py-2.5 text-left text-sm font-medium transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/60 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ol>

      <div
        aria-live="polite"
        className={`mt-10 transition-all duration-700 ${
          verdict ? "opacity-100 translate-y-0" : "opacity-60 translate-y-1"
        }`}
      >
        {verdict ? (
          <div className="rounded-3xl bg-primary/[0.06] p-8 sm:p-11">
            <p className="eyebrow">Your rung</p>
            <div className="mt-4 flex flex-wrap items-baseline gap-5">
              <span className="num text-6xl font-semibold tabular-nums tracking-[-0.05em] text-gradient-brand sm:text-7xl">
                {verdict.rung}
              </span>
              <span className="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
                {verdict.title}
              </span>
            </div>
            <p className="mt-6 max-w-2xl text-[1.0625rem] leading-[1.75] text-muted-foreground">
              {verdict.body}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to={verdict.cta.to} className="btn-gradient px-6 py-3 text-sm">
                {verdict.cta.label}
              </Link>
              <Link
                to="/auth"
                className="inline-flex items-center gap-2 rounded-full border border-border px-6 py-3 text-sm font-semibold transition-colors hover:bg-muted"
              >
                Start free
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Answer both questions and this tells you the highest rung your evidence can actually
            back up today.
          </p>

        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Equivalence band, explained.
 *
 * Same instrument as the Intelligence page's compact BandDiagram, opened up for
 * a reader who has never seen it: the axis is annotated in plain language, the
 * two zones are named ("disqualified" vs "statistically the same"), and the
 * arithmetic that produces the bar is spelled out above the chart rather than
 * left implicit.
 * ------------------------------------------------------------------------- */

export function BandExplainer({ winner, live }: { winner: BandWinner; live: boolean }) {
  // Scale: a little air on the left of the bar, a little past the leader.
  const pad = winner.margin * 1.35 || 1;
  const lo = Math.max(0, winner.bar - pad);
  const hi = winner.topScore + pad * 0.45;
  const span = hi - lo || 1;
  const pos = (v: number) => ((v - lo) / span) * 100;

  const barX = pos(winner.bar);
  const leadX = pos(winner.topScore);
  const winX = pos(winner.score);
  // Keep the floating callout inside the frame at any score position.
  const callout = Math.min(Math.max(winX, 20), 80);

  const n2 = (v: number) => v.toFixed(2);

  // When the cheapest qualifier sits right on the bar, one merged tick reads
  // clearly where two overlapping ones would collide.
  const merged = Math.abs(winX - barX) < 7;

  return (
    <div className="mt-8">
      {/* The arithmetic, as a sentence made of numbers. */}
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">
        <Term label="best model scores" value={n2(winner.topScore)} />
        <Op>−</Op>
        <Term label="how far the test can be off" value={`±${n2(winner.margin)}`} />
        <Op>=</Op>
        <Term label="the pass mark" value={n2(winner.bar)} accent />
      </div>
      <p className="mt-5 max-w-2xl text-[0.95rem] leading-relaxed text-muted-foreground">
        Any model scoring <span className="num text-foreground">{n2(winner.bar)}</span> or higher is
        close enough that this test cannot tell it apart from the best one.{" "}
        <span className="num text-foreground">{winner.qualifying}</span> model
        {winner.qualifying === 1 ? "" : "s"} pass, so price is the only thing left to decide, and the
        cheapest one wins.
      </p>


      {/* The axis ------------------------------------------------------- */}
      <div className="relative mt-16 select-none">
        {/* winner callout */}
        <div
          className="absolute -top-14 z-20 -translate-x-1/2 whitespace-nowrap"
          style={{ left: `${callout}%` }}
        >
          <div className="rounded-2xl bg-saving/12 px-4 py-2.5 text-center ring-1 ring-inset ring-saving/30">
            <p className="text-[0.7rem] font-medium uppercase tracking-[0.14em] text-saving">
              cheapest model that passes
            </p>
            <p className="mt-1 text-sm font-semibold tracking-tight">
              {live ? winner.displayName : "cheapest passing model"}
            </p>

          </div>
          <div className="mx-auto h-4 w-px bg-saving/40" />
        </div>

        {/* zones */}
        <div className="relative h-[104px] overflow-hidden rounded-2xl">
          {/* disqualified zone */}
          <div
            className="absolute inset-y-0 left-0"
            style={{
              width: `${barX}%`,
              background:
                "repeating-linear-gradient(135deg, color-mix(in oklab, var(--foreground) 4.5%, transparent) 0 6px, transparent 6px 12px)",
            }}
          />
          {/* equivalence band */}
          <div
            className="absolute inset-y-0"
            style={{
              left: `${barX}%`,
              right: 0,
              background:
                "linear-gradient(90deg, color-mix(in oklab, var(--primary) 16%, transparent), color-mix(in oklab, var(--primary) 7%, transparent))",
            }}
          />

          {/* zone labels */}
          <p
            className="absolute top-4 text-[0.7rem] font-medium uppercase tracking-[0.14em] text-muted-foreground/70"
            style={{ right: `calc(${100 - barX}% + 12px)` }}
          >
            too low · not allowed
          </p>
          <p
            className="absolute top-4 text-[0.7rem] font-medium uppercase tracking-[0.14em] text-primary"
            style={{ left: `calc(${barX}% + 14px)` }}
          >
            as good as the best model, as far as this test can tell

          </p>

          {/* the bar */}
          <div className="absolute inset-y-0 w-px bg-primary" style={{ left: `${barX}%` }} />
          {/* the leader */}
          <div
            className="absolute inset-y-0 w-px bg-foreground/45"
            style={{ left: `${leadX}%` }}
          />

          {/* the winner */}
          <div className="absolute top-1/2 -ml-2 h-4 w-4 -translate-y-1/2" style={{ left: `${winX}%` }}>
            <span className="absolute inset-0 rounded-full bg-saving ring-4 ring-background" />
            <span className="absolute -inset-2 rounded-full bg-saving/25 motion-safe:animate-ping" />
          </div>
        </div>

        {/* axis ticks */}
        <div className="relative mt-3 h-12">
          {merged ? (
            <Tick
              x={barX}
              value={n2(winner.bar)}
              label="pass mark · what we pick"
              saving
            />
          ) : (
            <>
              <Tick x={barX} value={n2(winner.bar)} label="pass mark" accent />
              <Tick x={winX} value={n2(winner.score)} label="what we pick" saving />
            </>
          )}
          <Tick x={leadX} value={n2(winner.topScore)} label="best model" align="end" />
        </div>
      </div>

      {/* price payoff ---------------------------------------------------- */}
      {live && winner.pricePerMtok > 0 ? (
        <div className="mt-10 flex flex-wrap items-baseline gap-x-5 gap-y-2 border-t border-border/60 pt-8">
          <span className="num text-5xl font-semibold tabular-nums tracking-[-0.045em] text-saving sm:text-6xl">
            ${winner.pricePerMtok.toFixed(2)}
          </span>
          <span className="text-sm text-muted-foreground">
            per million input tokens (MTok) at {winner.hostLabel}, at a quality this test rates the
            same as the best model.
          </span>

        </div>
      ) : null}
    </div>
  );
}

function Term({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <span className="flex flex-col">
      <span className="text-[0.7rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <span
        className={`num mt-1 tabular-nums tracking-[-0.045em] ${accent ? "text-gradient-brand" : ""}`}
      >
        {value}
      </span>
    </span>
  );
}

function Op({ children }: { children: ReactNode }) {
  return <span className="pb-0.5 text-xl text-muted-foreground/60 sm:text-2xl">{children}</span>;
}

function Tick({
  x,
  value,
  label,
  align = "center",
  accent,
  saving,
}: {
  x: number;
  value: string;
  label: string;
  align?: "center" | "end";
  accent?: boolean;
  saving?: boolean;
}) {
  return (
    <div
      className={`absolute top-0 flex flex-col ${
        align === "end" ? "-translate-x-full items-end pr-1" : "-translate-x-1/2 items-center"
      }`}
      style={{ left: `${x}%` }}
    >
      <span
        className={`num text-lg font-semibold tabular-nums tracking-[-0.03em] ${
          saving ? "text-saving" : accent ? "text-primary" : ""
        }`}
      >
        {value}
      </span>
      <span className="mt-0.5 whitespace-nowrap text-[0.65rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}
