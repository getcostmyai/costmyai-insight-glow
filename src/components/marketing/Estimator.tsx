import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, Loader2, RotateCcw, ShieldAlert, Sparkles } from "lucide-react";

import { estimateSpreadFn, estimatorOptionsQuery } from "@/lib/estimator.functions";
import { BOOK_DEMO_URL } from "@/lib/marketing-links";
import { trackEstimatorEvent } from "@/lib/telemetry.functions";
import { AllocationBar, type LineDraft } from "./AllocationBar";
import { Chip, Label, Row } from "./estimator-ui";
import type { AggregateEstimatorResult } from "@/lib/estimator/aggregate";
import {
  canAddLine,
  removeLine as removeLineFrom,
  startingShare,
  unallocatedPct,
  type DraftLine,
} from "@/lib/estimator/lines";

import {
  CONSERVATIVE_HIGH,
  CONSERVATIVE_LOW,
  DISTRIBUTIONS,
  WORKLOADS,
  type DistributionId,
  type EstimatorResult,
} from "@/lib/estimator/spec";

/** Fixed locale so SSR and client render identical digits. */
const fmtNum = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));

const STEPS = ["Spend", "Breakdown"] as const;

/** Quick jumps on the spend slider, in the range most inbound teams sit in. */
const SPEND_PRESETS = [1000, 5000, 25000, 100000] as const;

/** Bar heights (0-1) that show, at a glance, what each spread shape means. */
const SPREAD_GLYPHS: number[][] = [
  [1, 0.28, 0.2, 0.16],
  [0.72, 0.62, 0.55, 0.48],
  [0.42, 0.38, 0.34, 0.3],
];

function SpreadGlyph({ bars, on }: { bars: number[]; on: boolean }) {
  return (
    <div className="flex h-7 items-end gap-1" aria-hidden>
      {bars.map((h, i) => (
        <span
          key={i}
          className={`w-2 origin-bottom rounded-sm transition-[height,background-color,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            on ? "bg-primary scale-y-100" : "bg-border scale-y-[0.92] group-hover:bg-primary/40 group-hover:scale-y-100"
          }`}
          style={{
            height: `${Math.round(h * 100)}%`,
            transitionDelay: `${i * 45}ms`,
          }}
        />
      ))}
    </div>
  );
}

/** True one frame after mount, so entry transitions have a from-state to run from. */
function useMounted(reduced: boolean) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (reduced) {
      setOn(true);
      return;
    }
    const id = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(id);
  }, [reduced]);
  return on;
}



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
  const run = useServerFn(estimateSpreadFn);
  const reduced = usePrefersReducedMotion();

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [spend, setSpend] = useState(4000);
  const [distribution, setDistribution] = useState<DistributionId>("even");
  const [lines, setLines] = useState<DraftLine[]>([]);

  /* ---------------------------- telemetry ----------------------------- */
  /**
   * Two events, each fired at most once per page load. "Viewed" means the
   * estimator actually entered the viewport — it sits mid-page, so mounting is
   * not seeing. "Engaged" means the visitor touched any input at all, fired on
   * the first touch only rather than on every slider frame. Completion is
   * recorded server-side inside the estimate call itself.
   */
  const track = useServerFn(trackEstimatorEvent);
  const sectionRef = useRef<HTMLElement | null>(null);
  const sentViewed = useRef(false);
  const sentEngaged = useRef(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el || sentViewed.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting) || sentViewed.current) return;
        sentViewed.current = true;
        io.disconnect();
        void track({ data: { event: "estimator_viewed" } }).catch(() => {});
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [track]);

  const markEngaged = () => {
    if (sentEngaged.current) return;
    sentEngaged.current = true;
    void track({ data: { event: "estimator_engaged" } }).catch(() => {});
  };


  /**
   * Progression events. Each real action reports itself, rather than one
   * first-touch flag standing in for a whole session of work: the shape of a
   * breakdown a visitor built is only legible if every add, edit, resize and
   * removal is recorded with the state it produced.
   */
  const progression = (
    event:
      | "estimator_line_added"
      | "estimator_line_changed"
      | "estimator_line_removed"
      | "estimator_split_changed",
    payload: Record<string, unknown>,
  ) => {
    markEngaged();
    void track({ data: { event, payload } }).catch(() => {});
  };

  const shapeOf = (list: DraftLine[]) =>
    list.map((l) => ({
      workload: l.workload,
      provider: l.provider,
      modelKey: l.modelKey,
      sharePct: l.sharePct,
    }));

  const addLine = (draft: LineDraft) => {
    if (!canAddLine(lines).ok) return;
    const line: DraftLine = {
      id: `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      ...draft,
      sharePct: startingShare(lines),
    };
    const next = [...lines, line];
    setLines(next);
    progression("estimator_line_added", {
      ...draft,
      sharePct: line.sharePct,
      lineCount: next.length,
      unallocatedPct: unallocatedPct(next),
    });
  };

  const editLine = (id: string, draft: LineDraft) => {
    const before = lines.find((l) => l.id === id);
    if (!before) return;
    setLines(lines.map((l) => (l.id === id ? { ...l, ...draft } : l)));
    progression("estimator_line_changed", {
      from: { workload: before.workload, provider: before.provider, modelKey: before.modelKey },
      to: draft,
      sharePct: before.sharePct,
    });
  };

  const removeLine = (id: string) => {
    const gone = lines.find((l) => l.id === id);
    if (!gone) return;
    const next = removeLineFrom(lines, id);
    setLines(next);
    progression("estimator_line_removed", {
      workload: gone.workload,
      provider: gone.provider,
      modelKey: gone.modelKey,
      returnedPct: gone.sharePct,
      lineCount: next.length,
      unallocatedPct: unallocatedPct(next),
    });
  };

  /** Fired once per completed drag, never per frame. */
  const commitResize = (before: DraftLine[], after: DraftLine[], boundaryIndex: number) => {
    if (JSON.stringify(shapeOf(before)) === JSON.stringify(shapeOf(after))) return;
    progression("estimator_split_changed", {
      boundaryIndex,
      before: shapeOf(before),
      after: shapeOf(after),
      unallocatedPct: unallocatedPct(after),
    });
  };

  const mutation = useMutation({
    mutationFn: () =>
      run({
        data: {
          totalSpendUsd: spend,
          lines: lines.map((l) => ({
            workload: l.workload,
            provider: l.provider,
            modelKey: l.modelKey,
            sharePct: l.sharePct,
          })),
        },
      }),
  });
  const result = mutation.data as AggregateEstimatorResult | undefined;

  /* ------ indicative figure: server-computed rates × the live breakdown ----- */
  const indicative = useMemo(() => {
    const bands = options?.bands;
    if (!bands || lines.length === 0) return null;
    let modelled = 0;
    for (const line of lines) {
      const idx = bands.workloads.indexOf(line.workload);
      if (idx < 0) continue;
      const series = line.modelKey
        ? bands.byModel[line.modelKey]
        : line.provider
          ? bands.byProvider[line.provider]
          : null;
      const rate = series?.[idx];
      if (rate == null) continue;
      modelled += ((spend * line.sharePct) / 100) * rate;
    }
    if (modelled <= 0) return null;
    return { low: modelled * CONSERVATIVE_LOW, high: modelled * CONSERVATIVE_HIGH };
  }, [options, lines, spend]);

  /**
   * What the indicative figure actually rests on — the itemised part of the
   * spend only, never the whole number, so it can never read as if spend alone
   * produced it.
   */
  const basisLabel = useMemo(() => {
    if (lines.length === 0) return "nothing itemised yet";
    const covered = 100 - unallocatedPct(lines);
    return `${lines.length} ${lines.length === 1 ? "line" : "lines"} · ${covered}% of spend`;
  }, [lines]);

  const showResult = Boolean(result) || mutation.isPending;
  const headline = showResult ? 0 : (indicative?.high ?? 0);
  const rolled = useRollingNumber(headline, reduced);
  const rolledSpend = useRollingNumber(spend, reduced);
  const spendPct = ((rolledSpend - 200) / (200000 - 200)) * 100;

  const goto = (next: number) => {
    setDir(next > step ? 1 : -1);
    setStep(next);
  };

  /** A genuinely clean start: every input returns to its initial value. */
  const reset = () => {
    mutation.reset();
    setSpend(4000);
    setDistribution("even");
    setLines([]);
    setDir(-1);
    setStep(0);
  };

  return (
    <section ref={sectionRef} id="estimator" className="scroll-mt-24 wash-section">
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
          <div className="grid gap-5 border-b border-border px-6 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:px-8">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
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
                      className="group flex min-w-0 flex-1 flex-col gap-2 text-left"
                      aria-current={active ? "step" : undefined}
                    >
                      <span className="relative block h-[3px] w-full overflow-hidden rounded-full bg-border transition-colors duration-300 group-hover:bg-primary/25">
                        <span
                          className={`absolute inset-y-0 left-0 rounded-full transition-[width,background-color,opacity] duration-[650ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                            active ? "fill-gradient-brand" : "bg-saving/70"
                          }`}
                          style={{ width: active || done ? "100%" : "0%", opacity: active || done ? 1 : 0 }}
                        />
                      </span>

                      <span
                        className={`truncate text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors duration-300 ${
                          active
                            ? "text-primary"
                            : done
                              ? "text-foreground/60"
                              : "text-muted-foreground group-hover:text-foreground"
                        }`}
                      >
                        <span className="num mr-1.5 opacity-50">0{i + 1}</span>
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="sm:text-right">
              <p className="eyebrow">
                {showResult ? "Result" : indicative ? `Indicative · ${basisLabel}` : "Indicative"}
              </p>
              <p
                className={`num mt-1 text-[2.1rem] leading-none tabular-nums transition-colors duration-300 sm:text-[2.5rem] ${
                  indicative && !showResult ? "text-saving" : "text-muted-foreground/40"
                }`}
              >
                {showResult ? "—" : indicative ? `$${fmtNum(rolled)}` : "—"}
                {!showResult && indicative ? (
                  <span className="ml-1.5 text-xs font-medium tracking-normal text-muted-foreground">
                    / mo
                  </span>
                ) : null}
              </p>
              {!showResult && !indicative ? (
                <p className="mt-1 max-w-[15rem] text-[11px] leading-snug font-medium text-muted-foreground sm:ml-auto">
                  Pick a workload and a provider — spend alone is not a measurement
                </p>
              ) : null}
            </div>
          </div>


          {/* ---------------- body ---------------- */}
          <div className="relative min-h-[262px] px-6 py-7 sm:px-8">
            {showResult ? (
              <div key="result" className={reduced ? "" : "animate-scale-in"}>
                {mutation.isPending ? <Pending /> : result ? <AggregateResult r={result} /> : null}
              </div>
            ) : (
              <div
                key={step}
                className={reduced ? "" : dir > 0 ? "step-in-right" : "step-in-left"}
              >
                {step === 0 ? (
                  <div>
                    <Label>Monthly AI spend</Label>
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <p className="num text-5xl leading-none tabular-nums text-foreground sm:text-6xl">
                        ${fmtNum(rolledSpend)}
                      </p>
                      <span className="text-sm text-muted-foreground">/ month</span>
                    </div>
                    <input
                      type="range"
                      min={200}
                      max={200000}
                      step={200}
                      value={spend}
                      onChange={(e) => { markEngaged(); setSpend(Number(e.target.value)); }}
                      aria-label="Monthly AI spend"
                      className="slider-brand mt-6 w-full cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${spendPct}%, var(--secondary) ${spendPct}%, var(--secondary) 100%)`,
                      }}
                    />
                    <div className="mt-2.5 flex items-center justify-between">
                      <span className="num text-[11px] font-medium text-muted-foreground">$200</span>
                      <div className="flex gap-1.5">
                        {SPEND_PRESETS.map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => { markEngaged(); setSpend(p); }}
                            className={`num rounded-full px-2.5 py-1 text-[11px] transition-colors duration-200 ${
                              spend === p
                                ? "bg-primary-soft text-primary"
                                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                            }`}
                          >
                            ${p >= 1000 ? `${p / 1000}k` : p}
                          </button>
                        ))}
                      </div>
                      <span className="num text-[11px] font-medium text-muted-foreground">$200k</span>
                    </div>

                    <Label className="mt-8">How is it spread?</Label>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {DISTRIBUTIONS.map((d, i) => {
                        const on = distribution === d.id;
                        return (
                          <button
                            key={d.id}
                            type="button"
                            onClick={() => { markEngaged(); setDistribution(d.id); }}
                            className={`group rounded-2xl border px-3.5 py-3 text-left transition-all duration-200 hover:-translate-y-0.5 ${
                              on
                                ? "border-primary/45 bg-primary-soft shadow-[0_6px_20px_-12px_var(--primary)]"
                                : "border-border bg-card hover:border-primary/25"
                            }`}
                          >
                            <SpreadGlyph bars={SPREAD_GLYPHS[i] ?? SPREAD_GLYPHS[1]!} on={on} />
                            <p className="mt-2.5 text-sm font-semibold tracking-tight">{d.label}</p>
                            <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                              {d.hint}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                ) : (
                  <AllocationBar
                    lines={lines}
                    totalSpendUsd={spend}
                    options={options}
                    onLinesChange={setLines}
                    onResizeCommit={commitResize}
                    onAddLine={addLine}
                    onEditLine={editLine}
                    onRemoveLine={removeLine}
                  />
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
            ) : step < 1 ? (
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
                data-testid="estimator-submit"
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending || lines.length === 0}
                title={lines.length === 0 ? "Add at least one workload first" : undefined}
                className="btn-gradient px-5 py-2.5 text-sm disabled:opacity-40"
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
  const reduced = usePrefersReducedMotion();
  const mounted = useMounted(reduced);
  // Count both ends of the range up from zero, so the answer lands rather than appears.
  const low = useRollingNumber(mounted ? r.lowUsd : 0, reduced);
  const high = useRollingNumber(mounted ? r.highUsd : 0, reduced);
  const share = Math.min(100, Math.max(2, r.sharePct));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <p className="eyebrow">Estimated monthly saving</p>
        <span
          className="inline-flex items-center gap-1.5 rounded-full bg-saving-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-saving transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? "translateY(0) scale(1)" : "translateY(2px) scale(0.96)",
            transitionDelay: "260ms",
          }}
        >
          <Sparkles className="h-3 w-3" /> {r.savingPct}% cheaper per call
        </span>
      </div>
      <p className="num mt-2 text-4xl leading-none tabular-nums text-saving sm:text-5xl">
        ${fmtNum(low)}
        <span className="mx-2 font-normal text-saving/40">–</span>${fmtNum(high)}
      </p>

      {/* Share of spend the estimate actually covers, drawn rather than asserted. */}
      <div className="mt-4">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-saving transition-[width] duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ width: `${mounted ? share : 0}%`, transitionDelay: "200ms" }}
          />
        </div>
        <p className="mt-1.5 text-[11px] font-medium text-muted-foreground">
          Applied to <span className="num text-foreground">{r.sharePct}%</span> of your stated spend
        </p>
      </div>


      <div className="mt-5 grid gap-x-8 sm:grid-cols-2">
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
  no_valid_instrument: "No instrument measures this work",
  task_label_low_confidence: "Work could not be labelled",
  no_cheaper_equal: "No certifiable switch found",
  model_not_in_catalog: "Cannot assess",
  shape_only: "Cannot assess without a named model",
  no_baseline_score: "Cannot assess — model unscored",
};

const REFUSAL_LEAD: Record<string, string> = {

  task_label_low_confidence:
    "Your container read this traffic locally and declined to name what kind of work it is, and certification is per task type. Requests carrying a structural signal — declared tools, or a constrained response schema — classify with certainty and do get certified.",
  no_valid_instrument:
    "No independent evaluation measures this kind of work today, so no switch on it can be certified. We would rather name that than quote a number nobody measured.",
  benchmark_not_discriminating:
    "No model currently differentiates enough on this to certify a switch — on your own traffic the picture is far sharper than a single assumed workload shape.",
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

/**
 * The multi-line answer.
 *
 * Every line is shown with its OWN top-level share — never the share nested
 * inside its engine result, which always reads the internal allocation
 * constant and says nothing about how the visitor split their spend. Refusals
 * and sub-threshold lines stay on screen with their real state: a total that
 * quietly dropped them would overstate what we can certify.
 */
function AggregateResult({ r }: { r: AggregateEstimatorResult }) {
  const reduced = usePrefersReducedMotion();
  const mounted = useMounted(reduced);
  const low = useRollingNumber(mounted ? r.totalCertifiedSavingLowUsd : 0, reduced);
  const high = useRollingNumber(mounted ? r.totalCertifiedSavingUsd : 0, reduced);
  const certified = r.totalCertifiedSavingUsd > 0;

  return (
    <div data-testid="aggregate-result">
      <p className="eyebrow">
        {certified ? "Certifiable monthly saving" : "Nothing certifiable in this breakdown"}
      </p>
      {certified ? (
        <p className="num mt-2 text-4xl leading-none tabular-nums text-saving sm:text-5xl">
          ${fmtNum(low)}
          <span className="mx-2 font-normal text-saving/40">–</span>${fmtNum(high)}
        </p>
      ) : (
        <p className="mt-2 text-2xl font-semibold leading-snug tracking-tight">
          No line here clears the bar today.
        </p>
      )}
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        Sum of the per-line figures below, nothing else. Lines that refused or came in under the $25
        floor contribute nothing and are still shown.{" "}
        <span className="num text-foreground">{r.certifiedSharePct}%</span> of your stated spend is
        covered by a certifiable line.
      </p>

      <div className="mt-5 space-y-2.5">
        {r.lines.map((line, i) => (
          <div
            key={`${line.workload}-${i}`}
            data-testid="result-line"
            data-share={line.sharePct}
            data-state={line.result.state}
            className="rounded-xl border border-border bg-card px-4 py-3"
          >
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-sm font-semibold tracking-tight">
                {WORKLOADS.find((w) => w.id === line.workload)?.label ?? line.workload}
              </span>
              <span className="text-xs text-muted-foreground">
                {line.provider ?? "no provider"}
                {line.modelKey ? ` · ${line.modelKey}` : ""}
              </span>
              <span
                data-testid="result-line-share"
                className="num ml-auto text-xs tabular-nums text-muted-foreground"
              >
                {line.sharePct}% · ${fmtNum(line.lineSpendUsd)}/mo
              </span>
            </div>

            {line.result.state === "ok" ? (
              <p className="num mt-1.5 text-lg tabular-nums text-saving">
                ${fmtNum(line.result.lowUsd)} – ${fmtNum(line.result.highUsd)}
                <span className="ml-2 text-xs font-medium tracking-normal text-muted-foreground">
                  {line.result.fromModelLabel} → {line.result.toModelLabel} ·{" "}
                  {line.result.toHostLabel}
                </span>
              </p>
            ) : line.result.state === "below_threshold" ? (
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                Under the ${fmtNum(line.result.floorUsd)}/mo floor on its own — real, just too small
                to act on. Contributes nothing to the total.
              </p>
            ) : (
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                <ShieldAlert className="mr-1 inline h-3.5 w-3.5 text-muted-foreground" />
                {REFUSAL_TITLE[line.result.reason] ?? "Cannot assess"} — {line.result.headline}
              </p>
            )}
          </div>
        ))}
      </div>

      {r.unallocated.sharePct > 0 ? (
        <p
          data-testid="result-unallocated"
          data-share={r.unallocated.sharePct}
          className="mt-3 text-xs leading-relaxed text-muted-foreground"
        >
          <span className="num text-foreground">{r.unallocated.sharePct}%</span> of your spend ($
          {fmtNum(r.unallocated.impliedSpendUsd)}/mo) was not itemised, so it was not priced at all.
          No saving is claimed on it.
        </p>
      ) : null}

      {certified ? (
        <StartCompare />
      ) : (
        <NotADeadEnd lead="Nothing in this breakdown clears the bar on today's catalog." />
      )}
    </div>
  );
}
