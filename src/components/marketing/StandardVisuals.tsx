import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Coins, FileCheck2, Gauge, ShieldCheck } from "lucide-react";

import { Reveal } from "@/components/marketing/Reveal";

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
    requirement: "Same model, cheaper host — identical weights, nothing to prove about quality.",
    proof: "Model + price",
    proofDetail:
      "A resolved model identity and a live per-token price on every host serving those exact weights.",
    plan: "Free",
  },
  {
    n: 2,
    key: "certify",
    name: "Certify",
    requirement:
      "A different, cheaper model — only when it clears the leader's score minus that benchmark's own measured margin.",
    proof: "Benchmark + margin",
    proofDetail:
      "A third-party score for the task class and the evaluation's published measurement margin. No margin, no claim.",
    plan: "Paid",
  },
  {
    n: 3,
    key: "rightsize",
    name: "Rightsize",
    requirement:
      "The model is larger than the work requires — detected from the real token and complexity profile, switched by you.",
    proof: "Token + complexity profile",
    proofDetail:
      "Observed input/output token mix and task complexity per workload, not a list-price assumption.",
    plan: "Paid",
  },
  {
    n: 4,
    key: "govern",
    name: "Govern",
    requirement:
      "Certified switches applied unattended, with automatic rollback the moment the evidence stops holding.",
    proof: "Full evidence trail",
    proofDetail:
      "Every autonomous action carries the price, the score, the margin and the rollback condition that authorised it.",
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
        const inset = (r.n - 1) * 3.5;
        const strength = 0.05 + r.n * 0.045;
        return (
          <Reveal key={r.key} delay={(RUNGS.length - i) * 70}>
            <div
              className="grid items-center gap-4 rounded-2xl px-5 py-6 sm:ml-[var(--ins)] sm:grid-cols-[auto_10rem_minmax(0,1fr)_auto] sm:gap-7 sm:px-8"
              style={{
                ["--ins" as string]: `${inset}rem`,
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
      "Can you attribute last month's AI bill to individual workloads and models without opening a provider console?",
    options: [
      { value: "yes", label: "Yes — attribution is a query" },
      { value: "partly", label: "Partly — totals yes, per workload no" },
      { value: "no", label: "No — I'd have to open the console" },
    ],
  },
  {
    id: "evidence",
    prompt: "Was your last model change backed by a benchmark, or by an opinion?",
    options: [
      { value: "benchmark", label: "A benchmark, with a stated margin" },
      { value: "vibes", label: "A leaderboard glance or a team opinion" },
      { value: "none", label: "We haven't changed a model" },
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
      body: "Without per-workload attribution there is nothing to compare, so no optimisation strategy can be evidenced yet. Instrument spend at the request level first — everything above depends on it.",
      cta: { to: "/pricing", label: "See what the free level covers" },
    };
  }
  if (attribution === "partly") {
    return {
      rung: 1,
      title: "Rung 1 — Compare",
      body: "You can see the bill but not yet split it cleanly. Identical-model host switches are available to you today: same weights, cheaper host, zero quality risk and nothing to prove beyond the price.",
      cta: { to: "/models", label: "Browse the live price catalog" },
    };
  }
  if (evidence === "benchmark") {
    return {
      rung: 3,
      title: "Rung 3 — Rightsize",
      body: "Attribution is solved and your last change carried evidence, so cross-model substitution is already within reach. The open question is whether your models are simply larger than the work requires — that is a token and complexity profile problem, not a price problem.",
      cta: { to: "/pricing", label: "See the Rightsize level" },
    };
  }
  return {
    rung: 2,
    title: "Rung 2 — Certify",
    body: "You can attribute spend, but your last model change rested on an opinion rather than a measured margin. Certification is the next rung: the cheapest model that clears the leader's score minus that benchmark's own margin, and a refusal when nothing does.",
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
            Answer both questions and this returns the highest rung your evidence actually supports.
          </p>
        )}
      </div>
    </div>
  );
}
