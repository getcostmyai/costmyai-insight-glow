import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Loader2, ShieldAlert, Sparkles } from "lucide-react";

import { estimateSavingFn, estimatorOptionsQuery } from "@/lib/estimator.functions";
import {
  DISTRIBUTIONS,
  WORKLOADS,
  type DistributionId,
  type EstimatorResult,
  type WorkloadId,
} from "@/lib/estimator/spec";

/**
 * The public estimator.
 *
 * Every number it shows comes back from the server, computed against the live
 * catalog with the same measured margins the certify path uses. When the data
 * cannot support a claim it says exactly which kind of "cannot" it is — a
 * refusal is a result here, not an error state.
 */
export function Estimator() {
  const { data: options } = useQuery(estimatorOptionsQuery());
  const run = useServerFn(estimateSavingFn);

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

  return (
    <section id="estimator" className="scroll-mt-24 wash-section">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">Estimator</p>
          <h2 className="mt-3 text-3xl font-bold tracking-[-0.028em] sm:text-4xl">
            How much could you save?
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
            A rough, one-time read against the live catalog. It runs the same quality bar the
            product runs — so if the benchmark cannot back a claim, this will tell you so instead of
            inventing a number.
          </p>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          {/* ---------------- inputs ---------------- */}
          <div className="card-surface p-7">
            <Field label="Monthly AI spend">
              <div className="flex items-baseline gap-3">
                <p className="num text-3xl text-foreground">${spend.toLocaleString()}</p>
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
                className="mt-4 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-secondary accent-primary"
              />
            </Field>

            <Field label="Provider">
              <div className="flex flex-wrap gap-2">
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
            </Field>

            <Field label="Workload type">
              <div className="flex flex-wrap gap-2">
                {WORKLOADS.map((w) => (
                  <Chip key={w.id} active={workload === w.id} onClick={() => setWorkload(w.id)}>
                    {w.label}
                  </Chip>
                ))}
              </div>
            </Field>

            <Field label="Specific model" hint="optional">
              <select
                value={modelKey ?? ""}
                onChange={(e) => setModelKey(e.target.value || null)}
                className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm outline-none focus:border-primary/50"
              >
                <option value="">No specific model</option>
                {(options?.models ?? []).map((m) => (
                  <option key={m.model_key} value={m.model_key}>
                    {m.display_name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Spend distribution">
              <div className="grid gap-2 sm:grid-cols-3">
                {DISTRIBUTIONS.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setDistribution(d.id)}
                    className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      distribution === d.id
                        ? "border-primary/45 bg-primary-soft"
                        : "border-border bg-card hover:border-primary/25"
                    }`}
                  >
                    <p className="text-sm font-semibold tracking-tight">{d.label}</p>
                    <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{d.hint}</p>
                  </button>
                ))}
              </div>
            </Field>

            <button
              type="button"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className="btn-gradient mt-7 w-full px-6 py-3 text-[15px] disabled:opacity-70"
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Checking the catalog
                </>
              ) : (
                <>
                  Estimate my saving <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>

          {/* ---------------- output ---------------- */}
          <div className="card-surface flex flex-col p-7">
            {!result && !mutation.isPending ? (
              <Placeholder />
            ) : mutation.isPending ? (
              <Placeholder pending />
            ) : result?.state === "ok" ? (
              <Success r={result} />
            ) : result?.state === "below_threshold" ? (
              <BelowThreshold r={result} />
            ) : result ? (
              <Refused r={result} />
            ) : null}

            <div className="mt-auto border-t border-border pt-5">
              <p className="text-xs leading-relaxed text-muted-foreground">
                This is a rough one-time estimate off an assumed token mix. A real Compare
                connection reads your actual traffic continuously — and it is free.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link to="/auth" className="btn-gradient px-5 py-2.5 text-sm">
                  Connect Compare — free
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link to="/demo" className="btn-quiet px-5 py-2.5 text-sm">
                  See it on live data
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function Placeholder({ pending = false }: { pending?: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-14 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary-soft">
        {pending ? (
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        ) : (
          <Sparkles className="h-5 w-5 text-primary" />
        )}
      </div>
      <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
        {pending
          ? "Pricing your shape against every host in the live catalog."
          : "Set your spend and workload, and we will price it against every host and score in the live catalog."}
      </p>
    </div>
  );
}

function Success({ r }: { r: Extract<EstimatorResult, { state: "ok" }> }) {
  return (
    <div className="flex-1">
      <div className="flex items-center gap-2">
        <p className="eyebrow">Estimated monthly saving</p>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-saving-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-saving">
          <span className="h-1.5 w-1.5 rounded-full bg-saving animate-pulse-dot" />
          Live
        </span>
      </div>

      <p className="num mt-3 text-4xl text-saving sm:text-[2.75rem]">
        ${Math.round(r.lowUsd).toLocaleString()}–${Math.round(r.highUsd).toLocaleString()}
      </p>
      <p className="mt-1.5 text-sm text-muted-foreground">
        on a <span className="num">{r.savingPct}%</span> price delta for this workload shape
      </p>

      <div className="mt-6 space-y-2.5">
        <Row label="Priced from" value={r.fromModelLabel} />
        <Row label="Cheapest equal-quality" value={`${r.toModelLabel} · ${r.toHostLabel}`} />
        <Row
          label="Quality bar"
          value={`${r.suite} / ${r.taskClass}, margin ±${r.margin.toFixed(2)}`}
        />
      </div>

      <p className="mt-6 rounded-xl bg-secondary px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
        Basis: conservative half-to-four-fifths of the modelled price delta, applied to{" "}
        <span className="num">{r.sharePct}%</span> of your stated spend for this workload, at an
        assumed {r.assumedMix}. Prices and scores from the live CostMyAI catalog; the equal-quality
        test is the same measured margin the product certifies against.
      </p>
    </div>
  );
}

function BelowThreshold({ r }: { r: Extract<EstimatorResult, { state: "below_threshold" }> }) {
  return (
    <div className="flex-1">
      <p className="eyebrow">Too small to matter</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight">
        Under ${Math.max(1, Math.round(r.highUsd))} a month.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        There is a cheaper equal-quality option to {r.fromModelLabel} on this workload, but at your
        spend it is not worth an afternoon of engineering time. We would rather say that than
        manufacture a minimum worth switching for.
      </p>
    </div>
  );
}

function Refused({ r }: { r: Extract<EstimatorResult, { state: "refused" }> }) {
  return (
    <div className="flex-1">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-primary" />
        <p className="eyebrow">Refused — {r.reason.replace(/_/g, " ")}</p>
      </div>
      <p className="mt-3 text-2xl font-semibold leading-snug tracking-tight">{r.headline}</p>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{r.detail}</p>
      <p className="mt-6 rounded-xl bg-secondary px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
        A refusal is a product surface here, not a failure. The engine names what it cannot prove
        rather than routing you somewhere it has not measured.
      </p>
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

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6 last:mb-0">
      <p className="eyebrow mb-2.5">
        {label}
        {hint ? <span className="ml-1.5 font-normal normal-case opacity-70">({hint})</span> : null}
      </p>
      {children}
    </div>
  );
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
      className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "border-primary/45 bg-primary-soft text-primary"
          : "border-border bg-card text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
