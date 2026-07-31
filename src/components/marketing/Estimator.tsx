import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, Loader2, RotateCcw, ShieldAlert, Sparkles } from "lucide-react";

import { estimateSavingFn, estimatorOptionsQuery } from "@/lib/estimator.functions";
import { BOOK_DEMO_URL } from "@/lib/marketing-links";
import {
  CONSERVATIVE_HIGH,
  CONSERVATIVE_LOW,
  DISTRIBUTIONS,
  WORKLOADS,
  type DistributionId,
  type EstimatorResult,
  type WorkloadId,
} from "@/lib/estimator/spec";

/** Fixed locale so SSR and client render identical digits. */
const fmtNum = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));

const STEPS = ["Spend", "Workload", "Where it runs"] as const;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** Eases a number toward its target so every input lands with a little motion. */
function useRollingNumber(target: number, reduced: boolean) {
  const [value, setValue] = useState(target);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (reduced) {
      setValue(target);
      return;
    }
    const start = performance.now();
    const from = value;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 420);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(from + (target - from) * eased);
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, reduced]);
  return value;
}

/**
 * The public estimator.
 *
 * The figure that ticks while you drag is *indicative*: it multiplies your
 * spend by a saving rate that the server already computed with the same
 * resolveEstimate the authoritative endpoint runs, against the same catalog
 * rows. No pricing logic runs in the browser. On submit the real result
 * replaces it — and any refusal clears it entirely, because a stale number next
 * to "we cannot certify this" would be the one dishonest thing this tool could do.
 */
export function Estimator() {
  const { data: options } = useQuery(estimatorOptionsQuery());
  const run = useServerFn(estimateSavingFn);
  const reduced = usePrefersReducedMotion();

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [spend, setSpend] = useState(4000);
  const [provider, setProvider] = useState<string | null>(null);
  const [workload, setWorkload] = useState<WorkloadId>("chat");
  const [modelKey, setModelKey] = useState<string | null>(null);
  const [distribution, setDistribution] = useState<DistributionId>("even");

  const mutation = useMutation({
    mutationFn: () =>
      run({ data: { monthlySpendUsd: spend, provider, workload, modelKey, distribution } }),
  });
  const result = mutation.data as EstimatorResult | undefined;

  /* -------- indicative figure: server-computed rate × live inputs -------- */
  const indicative = useMemo(() => {
    const bands = options?.bands;
    if (!bands) return null;
    const idx = bands.workloads.indexOf(workload);
    if (idx < 0) return null;
    const series = modelKey ? bands.byModel[modelKey] : provider ? bands.byProvider[provider] : null;
    const rate = series?.[idx];
    if (rate == null) return null;
    const share = DISTRIBUTIONS.find((d) => d.id === distribution)?.share ?? 0.45;
    const modelled = spend * share * rate;
    return { low: modelled * CONSERVATIVE_LOW, high: modelled * CONSERVATIVE_HIGH };
  }, [options, workload, provider, modelKey, distribution, spend]);

  /**
   * What the indicative figure actually rests on. Shown next to the number so
   * it can never read as if spend alone produced it — including when the user
   * steps back to Spend after choosing a workload and a provider.
   */
  const basisLabel = useMemo(() => {
    const w = WORKLOADS.find((x) => x.id === workload)?.label ?? workload;
    const where = modelKey
      ? (options?.models.find((m) => m.model_key === modelKey)?.display_name ?? modelKey)
      : (provider ?? null);
    return where ? `${w} · ${where}` : w;
  }, [workload, provider, modelKey, options]);

  const showResult = Boolean(result) || mutation.isPending;
  const headline = showResult ? 0 : (indicative?.high ?? 0);
  const rolled = useRollingNumber(headline, reduced);


  const goto = (next: number) => {
    setDir(next > step ? 1 : -1);
    setStep(next);
  };

  const reset = () => {
    mutation.reset();
    setDir(-1);
    setStep(0);
  };

  return (
    <section id="estimator" className="scroll-mt-24 wash-section">
      <div className="mx-auto max-w-4xl px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">Estimator</p>
          <h2 className="mt-3 text-3xl font-bold tracking-[-0.028em] sm:text-4xl">
            How much could you save?
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
            Three quick inputs, priced against the live catalog with the same quality bar the
            product runs. If the benchmark cannot back a claim, it says so instead of inventing a
            number.
          </p>
        </div>

        <div className="card-surface mt-9 overflow-hidden">
          {/* ---------------- header: rail + live figure ---------------- */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-6 py-4 sm:px-8">
            <div className="flex items-center gap-2">
              {STEPS.map((label, i) => {
                const active = !showResult && i === step;
                const done = showResult || i < step;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      if (showResult) reset();
                      goto(i);
                    }}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-300 ${
                      active
                        ? "bg-primary-soft text-primary"
                        : done
                          ? "text-foreground/70 hover:text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full transition-all duration-300 ${
                        active ? "bg-primary" : done ? "bg-saving" : "bg-border"
                      }`}
                    />
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="text-right">
              <p className="eyebrow">
                {showResult
                  ? "Result"
                  : indicative
                    ? `Indicative · ${basisLabel}`
                    : "Indicative"}
              </p>
              <p
                className={`num text-2xl leading-tight tabular-nums transition-colors duration-300 ${
                  indicative && !showResult ? "text-saving" : "text-muted-foreground"
                }`}
              >
                {showResult ? "—" : indicative ? `$${fmtNum(rolled)}` : "—"}
                {!showResult && indicative ? (
                  <span className="ml-1 text-xs font-medium text-muted-foreground">/ mo</span>
                ) : null}
              </p>
              {!showResult && !indicative ? (
                <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">
                  Pick a workload and a provider — spend alone is not a measurement
                </p>
              ) : null}
            </div>

          </div>

          {/* ---------------- body ---------------- */}
          <div className="relative min-h-[262px] px-6 py-7 sm:px-8">
            {showResult ? (
              <div key="result" className={reduced ? "" : "animate-scale-in"}>
                {mutation.isPending ? (
                  <Pending />
                ) : result?.state === "ok" ? (
                  <Success r={result} />
                ) : result?.state === "below_threshold" ? (
                  <BelowThreshold r={result} />
                ) : result ? (
                  <Refused r={result} />
                ) : null}
              </div>
            ) : (
              <div
                key={step}
                className={reduced ? "" : dir > 0 ? "step-in-right" : "step-in-left"}
              >
                {step === 0 ? (
                  <div>
                    <Label>Monthly AI spend</Label>
                    <div className="flex items-baseline gap-3">
                      <p className="num text-4xl tabular-nums text-foreground">${fmtNum(spend)}</p>
                      <span className="text-sm text-muted-foreground">/ month</span>
                    </div>
                    <input
                      type="range"
                      min={200}
                      max={200000}
                      step={200}
                      value={spend}
                      onChange={(e) => setSpend(Number(e.target.value))}
                      aria-label="Monthly AI spend"
                      className="mt-5 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-secondary accent-primary"
                    />
                    <Label className="mt-7">How is it spread?</Label>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {DISTRIBUTIONS.map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => setDistribution(d.id)}
                          className={`rounded-xl border px-3 py-2.5 text-left transition-all duration-200 hover:-translate-y-0.5 ${
                            distribution === d.id
                              ? "border-primary/45 bg-primary-soft"
                              : "border-border bg-card hover:border-primary/25"
                          }`}
                        >
                          <p className="text-sm font-semibold tracking-tight">{d.label}</p>
                          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                            {d.hint}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : step === 1 ? (
                  <div>
                    <Label>What does most of that spend do?</Label>
                    <div className="flex flex-wrap gap-2">
                      {WORKLOADS.map((w) => (
                        <Chip
                          key={w.id}
                          active={workload === w.id}
                          onClick={() => setWorkload(w.id)}
                        >
                          {w.label}
                        </Chip>
                      ))}
                    </div>
                    <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
                      Each workload carries an assumed token mix — stated in full with the result,
                      never hidden inside the number.
                    </p>
                  </div>
                ) : (
                  <div>
                    <Label>Provider</Label>
                    <div className="flex max-h-[104px] flex-wrap gap-2 overflow-y-auto pr-1">
                      <Chip active={provider === null} onClick={() => setProvider(null)}>
                        Not sure
                      </Chip>
                      {(options?.providers ?? []).map((p) => (
                        <Chip
                          key={p.label}
                          active={provider === p.label}
                          onClick={() => setProvider(p.label)}
                        >
                          {p.label}
                        </Chip>
                      ))}
                    </div>
                    <Label className="mt-6">
                      Specific model <span className="font-normal normal-case opacity-70">(optional, sharpens it)</span>
                    </Label>
                    <select
                      value={modelKey ?? ""}
                      onChange={(e) => setModelKey(e.target.value || null)}
                      className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-primary/50"
                    >
                      <option value="">No specific model</option>
                      {(options?.models ?? []).map((m) => (
                        <option key={m.model_key} value={m.model_key}>
                          {m.display_name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ---------------- footer controls ---------------- */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-4 sm:px-8">
            {showResult ? (
              <button type="button" onClick={reset} className="btn-quiet px-4 py-2 text-sm">
                <RotateCcw className="h-4 w-4" /> Change inputs
              </button>
            ) : (
              <button
                type="button"
                onClick={() => goto(Math.max(0, step - 1))}
                disabled={step === 0}
                className="btn-quiet px-4 py-2 text-sm disabled:opacity-40"
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
            )}

            {showResult ? (
              <p className="text-xs text-muted-foreground">
                One-time estimate off an assumed token mix. A real connection reads your traffic
                continuously.
              </p>
            ) : step < 2 ? (
              <button
                type="button"
                onClick={() => goto(step + 1)}
                className="btn-gradient px-5 py-2.5 text-sm"
              >
                Next <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
                className="btn-gradient px-5 py-2.5 text-sm disabled:opacity-70"
              >
                Get the real number <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function Pending() {
  return (
    <div className="flex min-h-[210px] flex-col items-center justify-center text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary-soft">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
      <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
        Pricing your shape against every host and score in the live catalog.
      </p>
    </div>
  );
}

/** Success CTA. Every other state gets the "not a dead end" framing instead. */
function StartCompare() {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-2">
      <Link to="/auth" className="btn-gradient px-5 py-2.5 text-sm">
        Start Compare, free <ArrowRight className="h-4 w-4" />
      </Link>
      <a
        href={BOOK_DEMO_URL}
        target="_blank"
        rel="noreferrer noopener"
        className="btn-quiet px-5 py-2.5 text-sm"
      >
        Book a Demo
      </a>
    </div>
  );
}

/**
 * Shared refusal / below-threshold CTA. A "no" here is a product surface, and
 * it points somewhere real rather than at a retry button.
 */
function NotADeadEnd({ lead }: { lead: string }) {
  return (
    <div className="mt-6 rounded-xl border border-border bg-secondary px-4 py-4">
      <p className="text-xs leading-relaxed text-muted-foreground">
        {lead} A refusal today is not a dead end — a real connection sees your actual traffic
        continuously, not just three rough inputs.
      </p>
      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <Link to="/auth" className="btn-gradient px-5 py-2.5 text-sm">
          Start Compare, free <ArrowRight className="h-4 w-4" />
        </Link>
        <a
          href={BOOK_DEMO_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="btn-quiet px-5 py-2.5 text-sm"
        >
          Book a Demo
        </a>
      </div>
    </div>
  );
}


function Success({ r }: { r: Extract<EstimatorResult, { state: "ok" }> }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <p className="eyebrow">Estimated monthly saving</p>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-saving-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-saving">
          <Sparkles className="h-3 w-3" /> {r.savingPct}% cheaper per call
        </span>
      </div>
      <p className="num mt-2 text-4xl tabular-nums text-saving">
        ${fmtNum(r.lowUsd)} – ${fmtNum(r.highUsd)}
      </p>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <Row label="From" value={r.fromModelLabel} />
        <Row label="To" value={`${r.toModelLabel} · ${r.toHostLabel}`} />
        <Row label="Quality bar" value={`${r.suite} / ${r.taskClass} ±${r.margin}`} />
        <Row label="Share of spend" value={`${r.sharePct}%`} />
      </div>

      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        Basis: conservative half-to-four-fifths of the modelled price delta, applied to{" "}
        <span className="num">{r.sharePct}%</span> of your stated spend, at an assumed {r.assumedMix}
        . Prices and scores from the live CostMyAI catalog; the equal-quality test is the same
        measured margin the product certifies against.
      </p>

      <StartCompare />
    </div>
  );
}

function BelowThreshold({ r }: { r: Extract<EstimatorResult, { state: "below_threshold" }> }) {
  return (
    <div>
      <p className="eyebrow">Below the savings threshold</p>
      <p className="mt-2 text-2xl font-semibold leading-snug tracking-tight">
        Too small to recommend a switch.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        At this spend level the potential saving (floor: ${fmtNum(r.floorUsd)}/mo) is too small to
        recommend a switch. Switching costs would likely exceed the saving. Revisit at higher volume
        or a different workload.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        There is a cheaper equal-quality option to {r.fromModelLabel} on {r.taskClass} work — it
        just comes to under ${fmtNum(Math.max(1, r.highUsd))} a month for you. We would rather say
        that than manufacture a minimum worth switching for.
      </p>
      <NotADeadEnd lead="The math worked here; the answer is simply too small to act on today." />
    </div>
  );
}

/** Each refusal is named for what it actually is, not for its internal code. */
const REFUSAL_TITLE: Record<string, string> = {
  benchmark_not_discriminating: "Switch not certifiable",
  no_cheaper_equal: "No certifiable switch found",
  model_not_in_catalog: "Cannot assess",
  shape_only: "Cannot assess without a named model",
  no_baseline_score: "Cannot assess — model unscored",
};

const REFUSAL_LEAD: Record<string, string> = {

  benchmark_not_discriminating:
    "We will not certify a switch the benchmark cannot separate — on your own traffic the picture is far sharper than a single assumed workload shape.",
  no_cheaper_equal:
    "On today's catalog this one is not overpriced, but your bill is more than one model.",
  model_not_in_catalog:
    "We cannot assess a model we have no verified price for.",
  shape_only:
    "We cannot assess a spend figure without knowing what you actually run.",
  no_baseline_score:
    "We cannot assess quality on a model nobody independently scored.",
};

function Refused({ r }: { r: Extract<EstimatorResult, { state: "refused" }> }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-primary" />
        <p className="eyebrow">{REFUSAL_TITLE[r.reason] ?? r.reason.replace(/_/g, " ")}</p>
      </div>
      <p className="mt-2 text-2xl font-semibold leading-snug tracking-tight">{r.headline}</p>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{r.detail}</p>
      <NotADeadEnd
        lead={REFUSAL_LEAD[r.reason] ?? "The engine names what it cannot prove."}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-background px-3.5 py-2.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium">{value}</span>
    </div>
  );
}

function Label({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`eyebrow mb-2.5 ${className}`}>{children}</p>;
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all duration-200 hover:-translate-y-0.5 ${
        active
          ? "border-primary/45 bg-primary-soft text-primary"
          : "border-border bg-card text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
