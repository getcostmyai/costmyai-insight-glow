import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BarChart3, Check, Loader2, Lock, ShieldCheck, Sparkles, X } from "lucide-react";

import {
  acknowledgeBenchmarkNotice,
  getProfileState,
  startBenchmarkProfile,
  saveBenchmarkAnswers,
  type ProfileState,
} from "@/lib/benchmark.functions";
import {
  HEADCOUNT_BANDS,
  INDUSTRIES,
  USE_CASES,
  MATURITIES,
  REVENUE_BANDS,
  type HeadcountBand,
  type Maturity,
  type RevenueBand,
  type UseCase,
} from "@/lib/benchmark/taxonomy";
import { checkAnswers } from "@/lib/benchmark/sanity";
import { usd } from "@/lib/dashboard-data";

/**
 * Progressive disclosure, earned by real usage.
 *
 * Nothing here gates the product. Before there is connected traffic the panel
 * is a single honest sentence about what will be possible later; once real
 * spend is flowing it becomes a concrete trade — four optional answers for a
 * comparison whose shape is already visible. Skipping every field costs
 * nothing but the comparison.
 */
export function BenchmarkPanel() {
  const query = useQuery({
    queryKey: ["profile-state"],
    queryFn: () => getProfileState(),
    staleTime: 60_000,
    retry: false,
  });

  const state = query.data;
  if (!state) return null;
  // Dispatch 121. A workspace older than the signup profiling step has no
  // profile row. Rendering nothing left those accounts with no way to ever
  // reach the benchmark; ask the two signup questions here instead.
  if (!state.profile) return <ProfileSetup />;

  if (state.benchmark.state === "shown") return <BenchmarkResult state={state} />;
  if (!state.hasUsage) return <Primer state={state} />;
  if (state.benchmark.state === "refused") return <Refusal state={state} />;
  return <ProgressiveAsk state={state} />;
}

function Frame({
  tone = "quiet",
  children,
}: {
  tone?: "quiet" | "invite";
  children: React.ReactNode;
}) {
  return (
    <section
      className={`card-surface relative overflow-hidden p-6 ${
        tone === "invite" ? "border-primary/30" : ""
      }`}
    >
      {tone === "invite" ? (
        <div className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-primary/10 blur-3xl" />
      ) : null}
      <div className="relative">{children}</div>
    </section>
  );
}

/** The two signup questions, for a workspace that never got asked them. */
function ProfileSetup() {
  const queryClient = useQueryClient();
  const [useCase, setUseCase] = useState<UseCase | "">("");
  const [useCaseOther, setUseCaseOther] = useState("");
  const [industry, setIndustry] = useState("");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      startBenchmarkProfile({ data: { useCase: useCase as UseCase, useCaseOther, industry } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profile-state"] }),
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message : "Could not save that just now."),
  });

  return (
    <Frame tone="invite">
      <p className="eyebrow flex items-center gap-2">
        <Sparkles className="size-3.5 text-primary" />
        Benchmark
      </p>
      <h3 className="mt-2 text-xl font-semibold tracking-tight">
        Two questions, and your spend gets a comparison
      </h3>
      <p className="mt-2 max-w-lg text-sm text-muted-foreground">
        This workspace was created before we started asking these at signup. They place you in a
        peer group; nothing else in CostMyAI depends on them.
      </p>

      <div className="mt-6 grid gap-4 border-t border-border/60 pt-6 sm:grid-cols-2">
        <Field label="What do you mainly use AI for?" hint="how your workloads are grouped">
          <Select value={useCase} onChange={(v) => setUseCase(v as UseCase)}>
            <option value="">Choose one</option>
            {USE_CASES.map((u) => (
              <option key={u.key} value={u.key}>
                {u.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Industry" hint="the closest match is good enough">
          <Select value={industry} onChange={setIndustry}>
            <option value="">Choose one</option>
            {INDUSTRIES.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </Select>
        </Field>
        {useCase === "other" ? (
          <Field label="Tell us in a few words" hint="a label on this workspace only">
            <input
              value={useCaseOther}
              onChange={(e) => setUseCaseOther(e.target.value)}
              maxLength={120}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </Field>
        ) : null}
      </div>

      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

      <button
        onClick={() => {
          setError(null);
          save.mutate();
        }}
        disabled={!useCase || !industry || save.isPending}
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        Save
      </button>
    </Frame>
  );
}

/** Step 2: expectation only. No fields, so the later ask is never a surprise. */
function Primer({ state }: { state: ProfileState }) {
  const queryClient = useQueryClient();
  const dismiss = useMutation({
    mutationFn: () => acknowledgeBenchmarkNotice({ data: { what: "primer" } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profile-state"] }),
  });

  if (state.profile?.primerSeen) return null;

  return (
    <Frame>
      <div className="flex items-start gap-3">
        <BarChart3 className="mt-0.5 size-4 shrink-0 text-primary" />
        <p className="text-sm text-muted-foreground">
          Once your gateway is sending real traffic, we'll show you how your spend compares to
          similar companies. We'll ask for a little more context then, not now.
        </p>
        <button
          onClick={() => dismiss.mutate()}
          aria-label="Dismiss"
          className="ml-auto text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
    </Frame>
  );
}

/** Step 3: the ask, at the moment there is something concrete to trade for it. */
function ProgressiveAsk({ state }: { state: ProfileState }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [revenueBand, setRevenueBand] = useState<RevenueBand | "">(
    (state.profile?.revenueBand as RevenueBand) ?? "",
  );
  const [headcountBand, setHeadcountBand] = useState<HeadcountBand | "">(
    (state.profile?.headcountBand as HeadcountBand) ?? "",
  );
  const [customerFacing, setCustomerFacing] = useState<boolean | null>(
    state.profile?.customerFacing ?? null,
  );
  const [maturity, setMaturity] = useState<Maturity | "">((state.profile?.maturity as Maturity) ?? "");
  const [warning, setWarning] = useState<string | null>(null);

  const sanity = checkAnswers({
    revenueBand: revenueBand || null,
    headcountBand: headcountBand || null,
    customerFacing,
    maturity: maturity || null,
    useCase: state.profile?.useCase as never,
  });

  const save = useMutation({
    mutationFn: () =>
      saveBenchmarkAnswers({
        data: {
          revenueBand: revenueBand || null,
          headcountBand: headcountBand || null,
          customerFacing,
          maturity: maturity || null,
        },
      }),
    onSuccess: async (res) => {
      setWarning(res.warning);
      await queryClient.invalidateQueries({ queryKey: ["profile-state"] });
    },
  });

  const nothingAnswered = !revenueBand && !headcountBand && customerFacing === null && !maturity;

  return (
    <Frame tone="invite">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-lg">
          <p className="eyebrow flex items-center gap-2">
            <Sparkles className="size-3.5 text-primary" />
            Benchmark
          </p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight">
            See how your spend compares to similar companies
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Four optional questions. Answer what you like, skip the rest — everything in CostMyAI
            keeps working either way.
          </p>
        </div>

        <div className="relative min-w-[15rem] rounded-2xl border border-border/70 bg-background/60 p-5">
          <p className="eyebrow">Companies like yours spend</p>
          <p className="num mt-1 select-none text-3xl text-foreground blur-[7px]">$8,400–$21,900</p>
          <p className="mt-1 select-none text-xs text-muted-foreground blur-[4px]">
            median $13,700 / month
          </p>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="size-3.5" />
            Unlocked by your answers
          </div>
        </div>
      </div>

      {open ? (
        <div className="mt-6 grid gap-4 border-t border-border/60 pt-6 sm:grid-cols-2">
          <Field label="Annual revenue" hint="the strongest signal for a fair comparison">
            <Select value={revenueBand} onChange={(v) => setRevenueBand(v as RevenueBand)}>
              <option value="">Prefer not to say</option>
              {REVENUE_BANDS.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Headcount" hint="used for per-employee framing only">
            <Select value={headcountBand} onChange={(v) => setHeadcountBand(v as HeadcountBand)}>
              <option value="">Prefer not to say</option>
              {HEADCOUNT_BANDS.map((h) => (
                <option key={h.key} value={h.key}>
                  {h.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Is your AI customer-facing?" hint="refines what you told us at signup">
            <Select
              value={customerFacing === null ? "" : customerFacing ? "yes" : "no"}
              onChange={(v) => setCustomerFacing(v === "" ? null : v === "yes")}
            >
              <option value="">Prefer not to say</option>
              <option value="yes">Yes, end users touch it</option>
              <option value="no">No, internal only</option>
            </Select>
          </Field>

          <Field label="How far along are you?" hint="pilot and production spend differently">
            <Select value={maturity} onChange={(v) => setMaturity(v as Maturity)}>
              <option value="">Prefer not to say</option>
              {MATURITIES.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>

          {sanity.warning ? (
            <p className="sm:col-span-2 text-xs text-[oklch(0.78_0.14_75)]">{sanity.warning}</p>
          ) : null}
          {warning ? <p className="sm:col-span-2 text-xs text-muted-foreground">{warning}</p> : null}

          <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending || nothingAnswered}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Show my benchmark
            </button>
            <button
              onClick={() => setOpen(false)}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Not now
            </button>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5" />
              A figure is only shown when at least five real companies stand behind it.
            </span>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          Answer four questions
        </button>
      )}
    </Frame>
  );
}

function Refusal({ state }: { state: ProfileState }) {
  const b = state.benchmark;
  if (b.state !== "refused") return null;
  return (
    <Frame>
      <p className="eyebrow">Benchmark</p>
      <h3 className="mt-2 text-base font-semibold">No honest comparison yet</h3>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        {b.reason === "no_dimensions"
          ? "You have not answered anything a cohort can be built from, so there is nothing to compare against."
          : `Fewer than ${b.floor} real companies match your profile closely enough, even after widening the group. We will not print a number that could describe one identifiable company, so this stays blank until the cohort is large enough.`}
      </p>
    </Frame>
  );
}

function BenchmarkResult({ state }: { state: ProfileState }) {
  const b = state.benchmark;
  if (b.state !== "shown") return null;
  const span = Math.max(1, b.highUsd - b.lowUsd);
  const pos = Math.min(1, Math.max(0, (b.yourMonthlyUsd - b.lowUsd) / span));
  const tone =
    b.position === "above"
      ? "oklch(0.78 0.16 25)"
      : b.position === "below"
        ? "oklch(0.82 0.16 155)"
        : "oklch(0.83 0.11 195)";

  return (
    <Frame tone="invite">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Benchmark · {b.cohortLabel}</p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight">
            Companies like yours spend{" "}
            <span className="num" style={{ color: tone }}>
              {usd(b.lowUsd, 0)}–{usd(b.highUsd, 0)}
            </span>{" "}
            <span className="text-muted-foreground">/ month</span>
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Median {usd(b.medianUsd, 0)} · {b.companyCount} real companies in this group
            {b.widened ? " · widened to keep the group anonymous" : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="eyebrow">Your last 30 days</p>
          <p className="num text-3xl" style={{ color: tone }}>
            {usd(b.yourMonthlyUsd, 0)}
          </p>
          <p className="text-xs text-muted-foreground">
            {b.position === "typical"
              ? "inside the typical range"
              : b.position === "below"
                ? "below the typical range"
                : "above the typical range"}
          </p>
        </div>
      </div>

      <div className="relative mt-6 h-2 rounded-full bg-border/60">
        <div className="absolute inset-y-0 left-[12%] right-[12%] rounded-full bg-primary/30" />
        <div
          className="absolute -top-1 size-4 rounded-full border-2 border-background"
          style={{ left: `calc(12% + ${pos * 76}% - 8px)`, background: tone }}
        />
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
        <span>{usd(b.lowUsd, 0)}</span>
        <span>median {usd(b.medianUsd, 0)}</span>
        <span>{usd(b.highUsd, 0)}</span>
      </div>
    </Frame>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
      {children}
    </label>
  );
}

function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
    >
      {children}
    </select>
  );
}
