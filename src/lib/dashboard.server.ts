import type { ObjectiveRow } from "./engine/objectives";
import { runPipeline } from "./engine/pipeline";
import type {
  BenchmarkRow,
  MarginRow,
  ModelRow,
  PlanTier,
  PriceRow,
  Recommendation,
  UsageAggregate,
} from "./engine/types";
import { deriveDataState, type DataState } from "./dashboard/onboarding";
import {
  effectiveSelection,
  mergeObjectives,
  type ObjectiveSelection,
} from "./dashboard/objective";
import { gateRung, nextPlan } from "./dashboard/plan";
import {
  partitionRollups,
  rangeWindow,
  selectCapturesInWindow,
  selectSwitchesInWindow,
} from "./dashboard/window";
import { createPublicServerClient, DEMO_ORG_ID } from "./supabase-public.server";


/**
 * The dashboard's single read.
 *
 * Everything on screen comes from here: the spend series, the pipeline verdicts,
 * the switches already running, and the reconciliation ledger. Nothing is
 * fabricated in the component layer — if a number cannot be derived from the
 * workspace's own rollups and the live price/benchmark feeds, it is not shown.
 */

export type RangeDays = 1 | 7 | 30;

export interface SeriesPoint {
  date: string;
  spend: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
}

export interface Totals {
  spend: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
}

export interface SwitchOpportunity {
  fromModel: string;
  fromHost: string;
  fromHostLabel: string;
  toModel: string;
  toHost: string;
  toHostLabel: string;
  taskHint: string;
  monthlySaving: number;
  savingPct: number;
  basis: string;
  note: string;
  qualityDelta: number | null;
}

export interface OversizedWorkload {
  model: string;
  host: string;
  task: string;
  toModel: string | null;
  wasted: number;
  savingPct: number;
  note: string;
}

export interface ActiveSwitchRow {
  fromModel: string;
  fromHost: string;
  toModel: string;
  toHost: string;
  badge: string;
  basis: string;
  since: string;
  activatedAt: string;
  saved: number;
  monthlyRate: number;
  autonomous: boolean;
}

export interface ReconciliationRow {
  provider: string;
  periodStart: string;
  periodEnd: string;
  estimatedUsd: number;
  invoicedUsd: number;
  deltaPct: number;
  verdict: string;
}

const DAY_MS = 86_400_000;

const round2 = (n: number) => Math.round(n * 100) / 100;

function emptyTotals(): Totals {
  return { spend: 0, requests: 0, inputTokens: 0, outputTokens: 0 };
}

function addTo(t: Totals, row: { requests: number; input_tokens: number; output_tokens: number; cost_usd: number }) {
  t.spend += Number(row.cost_usd);
  t.requests += Number(row.requests);
  t.inputTokens += Number(row.input_tokens);
  t.outputTokens += Number(row.output_tokens);
}

function bucketLabel(iso: string, days: RangeDays) {
  const d = new Date(iso);
  if (days === 1) return `${String(d.getUTCHours()).padStart(2, "0")}:00`;
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function medianOf(values: number[]) {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

function relativeAgo(iso: string | null, now: number) {
  if (!iso) return "never";
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export interface SnapshotInput {
  days: RangeDays;
  objective?: ObjectiveSelection | null;
}

export async function buildDashboardSnapshot(input: RangeDays | SnapshotInput) {
  const { days, objective: requestedObjective } =
    typeof input === "number" ? { days: input, objective: null } : input;
  const supabase = createPublicServerClient();
  const now = Date.now();
  const granularity = days === 1 ? "hour" : "day";
  const w = rangeWindow(days, now);
  const windowStart = w.start;
  const previousStart = w.previousStart;

  const [rollups, prices, benchmarks, margins, models, switches, org, firstEvent, storedObjectives] =
    await Promise.all([
      supabase
        .from("usage_rollups")
        .select(
          "bucket_start, model_key, host, task_hint, requests, input_tokens, output_tokens, cost_usd, output_p50, output_p95",
        )
        .eq("org_id", DEMO_ORG_ID)
        .eq("granularity", granularity)
        .gte("bucket_start", previousStart)
        .order("bucket_start", { ascending: true })
        .limit(100_000),
      supabase
        .from("host_prices")
        .select(
          "model_key, host, host_label, input_usd_per_mtok, output_usd_per_mtok, median_latency_ms, verified_at",
        ),
      supabase
        .from("benchmarks")
        .select("model_key, suite, task_class, score")
        .eq("is_fixture", false),
      supabase
        .from("benchmark_margins")
        .select("suite, task_class, margin, method, synced_at, source_run_id")
        .eq("is_fixture", false),
      supabase.from("model_catalog").select("model_key, display_name, vendor, tier"),
      supabase
        .from("switches")
        .select(
          "from_model, from_host, to_model, to_host, basis, badge, autonomous, status, activated_at, saved_usd",
        )
        .eq("org_id", DEMO_ORG_ID)
        .order("saved_usd", { ascending: false }),
      supabase.from("organizations").select("name, plan").eq("id", DEMO_ORG_ID).maybeSingle(),
      // Onboarding needs "has this workspace ever ingested anything", which is a
      // different question from "is there traffic in the selected window".
      supabase
        .from("usage_rollups")
        .select("bucket_start")
        .eq("org_id", DEMO_ORG_ID)
        .order("bucket_start", { ascending: true })
        .limit(1),
      supabase
        .from("objectives")
        .select("model_key, host, task_hint, objective, quality_floor_score, max_latency_ms")
        .eq("org_id", DEMO_ORG_ID),
    ]);

  const firstError =
    rollups.error ?? prices.error ?? benchmarks.error ?? margins.error ?? models.error ?? switches.error;
  if (firstError) {
    console.error("dashboard snapshot read failed", firstError);
    throw new Error("Could not load usage data");
  }

  const plan = (org.data?.plan ?? "rightsize") as PlanTier;
  const objective = effectiveSelection(plan, requestedObjective);
  const objectiveRows = mergeObjectives((storedObjectives.data ?? []) as ObjectiveRow[], objective);


  // ---- Series + window totals, split into current and previous window -------
  const buckets = new Map<string, SeriesPoint>();
  const totals = emptyTotals();
  const previous = emptyTotals();
  const shapes = new Map<string, { p50: number[]; p95: number[] }>();
  const byWorkload = new Map<string, UsageAggregate>();

  for (const r of rollups.data ?? []) {
    const isCurrent = r.bucket_start >= windowStart;
    addTo(isCurrent ? totals : previous, r);
    if (!isCurrent) continue;

    const label = bucketLabel(r.bucket_start, days);
    const point = buckets.get(label) ?? {
      date: label,
      spend: 0,
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
    };
    point.spend += Number(r.cost_usd);
    point.requests += Number(r.requests);
    point.inputTokens += Number(r.input_tokens);
    point.outputTokens += Number(r.output_tokens);
    buckets.set(label, point);

    const key = `${r.model_key}|${r.host}|${r.task_hint}`;
    const agg = byWorkload.get(key) ?? {
      model_key: r.model_key,
      host: r.host,
      task_hint: r.task_hint,
      requests: 0,
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
      days,
    };
    agg.requests += Number(r.requests);
    agg.input_tokens += Number(r.input_tokens);
    agg.output_tokens += Number(r.output_tokens);
    agg.cost_usd += Number(r.cost_usd);
    byWorkload.set(key, agg);

    const shape = shapes.get(key) ?? { p50: [], p95: [] };
    if (r.output_p50) shape.p50.push(Number(r.output_p50));
    if (r.output_p95) shape.p95.push(Number(r.output_p95));
    shapes.set(key, shape);
  }

  const series = [...buckets.values()].map((p) => ({ ...p, spend: round2(p.spend) }));

  const usage = [...byWorkload.entries()].map(([key, u]) => ({
    ...u,
    output_p50: medianOf(shapes.get(key)?.p50 ?? []),
    output_p95: medianOf(shapes.get(key)?.p95 ?? []),
  }));

  // ---- The engine, over exactly the traffic shown above ---------------------
  const priceRows = (prices.data ?? []).map((p) => ({
    model_key: p.model_key,
    host: p.host,
    host_label: p.host_label,
    input_usd_per_mtok: Number(p.input_usd_per_mtok),
    output_usd_per_mtok: Number(p.output_usd_per_mtok),
    median_latency_ms: p.median_latency_ms == null ? null : Number(p.median_latency_ms),
  })) as PriceRow[];

  const result = runPipeline({
    usage,
    prices: priceRows,
    benchmarks: (benchmarks.data ?? []).map((b) => ({ ...b, score: Number(b.score) })) as BenchmarkRow[],
    margins: (margins.data ?? []).map((m) => ({ ...m, margin: Number(m.margin) })) as MarginRow[],
    models: (models.data ?? []) as ModelRow[],
  });

  const toOpportunity = (r: Recommendation): SwitchOpportunity => ({
    fromModel: r.fromModel,
    fromHost: r.fromHost,
    fromHostLabel: r.fromHostLabel,
    toModel: r.toModel ?? r.fromModel,
    toHost: r.toHost ?? r.fromHost,
    toHostLabel: r.toHostLabel ?? r.fromHostLabel,
    taskHint: r.taskHint,
    monthlySaving: round2(r.monthlySavingUsd),
    savingPct: Math.round(r.savingPct),
    basis: r.basis,
    note: r.note,
    qualityDelta: r.qualityDelta,
  });

  const hostArbitrage = result.hostArbitrage.map(toOpportunity);
  const qualityMatched = result.qualityMatched.map(toOpportunity);
  const oversized: OversizedWorkload[] = result.oversized.map((r) => ({
    model: r.fromModel,
    host: r.fromHostLabel || r.fromHost,
    task: r.taskHint,
    toModel: r.toModel,
    wasted: round2(r.monthlySavingUsd),
    savingPct: Math.round(r.savingPct),
    note: r.note,
  }));

  // ---- What is already running ---------------------------------------------
  const activeSwitches: ActiveSwitchRow[] = (switches.data ?? [])
    .filter((s) => s.status === "active")
    .map((s) => {
      const activeDays = Math.max(1, (now - new Date(s.activated_at).getTime()) / DAY_MS);
      return {
        fromModel: s.from_model,
        fromHost: s.from_host,
        toModel: s.to_model,
        toHost: s.to_host,
        badge: s.badge,
        basis: s.basis,
        activatedAt: s.activated_at,
        since: new Date(s.activated_at).toISOString().slice(0, 10),
        saved: round2(Number(s.saved_usd)),
        monthlyRate: round2((Number(s.saved_usd) / activeDays) * 30),
        autonomous: s.autonomous,
      };
    });

  const frozen = (switches.data ?? []).filter((s) => s.status === "paused").length;

  // ---- Reconciliation: current ledger rows only (append-only history behind) --
  const reconciliation: ReconciliationRow[] = [];
  const { data: captures } = await supabase
    .from("billing_captures")
    .select("id, provider, period_start, period_end")
    .eq("org_id", DEMO_ORG_ID)
    .order("period_end", { ascending: false })
    .limit(6);
  if (captures?.length) {
    const { data: recons } = await supabase
      .from("billing_reconciliations")
      .select("capture_id, estimated_usd, invoiced_usd, delta_pct, verdict")
      .in(
        "capture_id",
        captures.map((c) => c.id),
      )
      .is("superseded_at", null);
    for (const c of captures) {
      const r = (recons ?? []).find((x) => x.capture_id === c.id);
      if (!r) continue;
      reconciliation.push({
        provider: c.provider,
        periodStart: c.period_start,
        periodEnd: c.period_end,
        estimatedUsd: round2(Number(r.estimated_usd)),
        invoicedUsd: round2(Number(r.invoiced_usd)),
        deltaPct: round2(Number(r.delta_pct)),
        verdict: r.verdict,
      });
    }
  }

  // ---- Coverage honesty ------------------------------------------------------
  const pricedPairs = new Set(priceRows.map((p) => `${p.model_key}|${p.host}`));
  const untracked = new Set(
    usage.filter((u) => !pricedPairs.has(`${u.model_key}|${u.host}`)).map((u) => u.model_key),
  );
  const lastVerified = (prices.data ?? [])
    .map((p) => p.verified_at)
    .filter(Boolean)
    .sort()
    .at(-1) as string | undefined;

  const availableMonthly = round2(
    [...hostArbitrage, ...qualityMatched].reduce((s, r) => s + r.monthlySaving, 0) +
      oversized.reduce((s, o) => s + o.wasted, 0),
  );
  const activeMonthly = round2(activeSwitches.reduce((s, a) => s + a.monthlyRate, 0));

  return {
    days,
    generatedAt: new Date(now).toISOString(),
    workspace: { name: org.data?.name ?? "Demo workspace", plan: org.data?.plan ?? "rightsize" },
    series,
    totals: {
      spend: round2(totals.spend),
      requests: totals.requests,
      inputTokens: totals.inputTokens,
      outputTokens: totals.outputTokens,
    },
    previous: {
      spend: round2(previous.spend),
      requests: previous.requests,
      inputTokens: previous.inputTokens,
      outputTokens: previous.outputTokens,
    },
    stats: result.stats,
    refusals: result.refusals.length,
    hostArbitrage,
    qualityMatched,
    oversized,
    activeSwitches,
    frozen,
    savings: {
      activeMonthly,
      availableMonthly,
      certifiedCount: hostArbitrage.length + qualityMatched.length,
      savedToDate: round2(activeSwitches.reduce((s, a) => s + a.saved, 0)),
    },
    reconciliation,
    coverage: {
      untrackedModels: untracked.size,
      pricesSyncedAgo: relativeAgo(lastVerified ?? null, now),
      evaluations: (margins.data ?? []).length,
    },
  };
}

export type DashboardSnapshot = Awaited<ReturnType<typeof buildDashboardSnapshot>>;
