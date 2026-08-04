import {
  DEFAULT_AUTONOMOUS_POLICY,
  evaluateAutonomous,
  type AutonomousVerdict,
} from "./engine/autonomous";
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
import { relativeAgo } from "./freshness";
import { deriveDataState, type DataState } from "./dashboard/onboarding";
import { forecastMonthEnd, FORECAST_RULES } from "./dashboard/forecast";
import { syncGapDays } from "./dashboard/sync-health.server";
import { buildComposition } from "./dashboard/composition";
import { aggregateSavings, capturedInWindow } from "./dashboard/savings";

import {
  effectiveSelection,
  mergeObjectives,
  type ObjectiveSelection,
} from "./dashboard/objective";
import { gateLevel, nextPlan } from "./dashboard/plan";
import { effectivePlan, type SubscriptionState } from "./billing/entitlement";
import { paymentsEnvironment } from "./billing/env.server";
import {
  partitionRollups,
  rangeWindow,
  selectCapturesInWindow,
  selectSwitchesInWindow,
} from "./dashboard/window";
import { createPublicServerClient, DEMO_ORG_ID } from "./supabase-public.server";
import { fetchAllRows } from "@/lib/paginate.server";


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
  /** Real dollars this switch would have saved inside the selected window. */
  saving: number;
  /** The same saving as a labelled 30-day run-rate. Never summed into a window. */
  monthlySaving: number;
  savingPct: number;
  basis: string;
  note: string;
  qualityDelta: number | null;
}

/** A switch the autonomous gate would run unattended. */
export interface GovernCandidate {
  kind: string;
  fromModel: string;
  fromHost: string;
  toModel: string;
  toHost: string;
  taskHint: string;
  /** Real dollars over the selected window. */
  saving: number;
  /** Labelled 30-day run-rate, which the autonomous threshold is written in. */
  monthlySaving: number;
  basis: string;
}

/** A switch the autonomous gate refuses to run unattended, and why. */
export interface GovernRefusal extends GovernCandidate {
  reason: Extract<AutonomousVerdict, { allowed: false }>["reason"];
  detail: string;
}

/**
 * A workload the certification engine looked at and could not turn into money,
 * carrying the engine's own verdict rather than a generic refusal message.
 */
export interface NonQualifyingWorkload {
  fromModel: string;
  fromHost: string;
  taskHint: string;
  reason: string;
  /** Plain-English rendering of the engine's verdict code. */
  label: string;
  detail: string;
  monthlySpend: number;
}

/** The four-cell certification matrix, in the words a customer reads. */
export const REFUSAL_LABEL: Record<string, string> = {
  no_baseline_price: "no published price for this endpoint",
  // Two different facts, and they were sharing one label: this one is about the
  // MODEL having no measured result, the next is about the TASK having no
  // instrument that measures it at all.
  no_baseline_score: "no measured score for this model",
  no_valid_instrument: "no independent instrument measures this task type",
  benchmark_not_discriminating:
    "no model currently differentiates enough on this to certify a switch",
  no_candidate_clears_bar: "quality gap outside the equivalence band",
  no_cheaper_candidate: "already the cheapest model that holds this quality",
  latency_ceiling_unmet: "no equal-quality option met your latency ceiling",
  saving_below_floor: "the saving is too small to be worth a switch",
};



export interface OversizedWorkload {
  model: string;
  host: string;
  /** Raw provider key behind the label — right-sizing stays on the same host. */
  hostKey: string;
  task: string;
  toModel: string | null;
  /** Real dollars this workload wasted inside the selected window. */
  wasted: number;
  /** The same waste as a labelled 30-day run-rate, for the ledger and Govern. */
  wastedMonthly: number;
  savingPct: number;
  note: string;
}

export interface ActiveSwitchRow {
  switchId: string;
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
/** Real percentage, one decimal, always short of a bare 100%. */
const pct1 = (n: number) => Math.min(99.9, Math.max(0, Math.round(n * 10) / 10));

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

interface RollupRow {
  bucket_start: string;
  model_key: string;
  host: string;
  task_hint: string;
  requests: number | string;
  input_tokens: number | string;
  output_tokens: number | string;
  cost_usd: number | string;
  output_p50?: number | string | null;
  output_p95?: number | string | null;
}

/**
 * Collapse rollups into one aggregate per workload. Shared by the window read
 * and the fixed 30-day baseline the headline claim is anchored to, so both
 * shape their input identically.
 */
function aggregateUsage(rows: RollupRow[], days: number): UsageAggregate[] {
  const byWorkload = new Map<string, UsageAggregate>();
  const shapes = new Map<string, { p50: number[]; p95: number[] }>();
  for (const r of rows) {
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
  return [...byWorkload.entries()].map(([key, u]) => ({
    ...u,
    output_p50: medianOf(shapes.get(key)?.p50 ?? []),
    output_p95: medianOf(shapes.get(key)?.p95 ?? []),
  }));
}



export interface SnapshotInput {
  days: RangeDays;
  objective?: ObjectiveSelection | null;
  /** Whose workspace to read. Defaults to the public demo org. */
  orgId?: string;
  /**
   * Supabase client to read through. Defaults to the anon publishable client,
   * which RLS confines to the demo org. Authenticated callers pass their own
   * request-scoped client so RLS answers as that member — the org id alone
   * never grants access to a workspace the caller is not a member of.
   */
  client?: DashboardClient;
}

export type DashboardClient = ReturnType<typeof createPublicServerClient>;

function toSubscriptionState(row: {
  plan: unknown;
  status: unknown;
  current_period_end: unknown;
  cancel_at_period_end: unknown;
} | null): SubscriptionState | null {
  if (!row) return null;
  return {
    plan: row.plan as PlanTier,
    status: row.status as string,
    currentPeriodEnd: (row.current_period_end as string | null) ?? null,
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
  };
}

export async function buildDashboardSnapshot(input: RangeDays | SnapshotInput) {
  const {
    days,
    objective: requestedObjective,
    orgId = DEMO_ORG_ID,
    client,
  } = typeof input === "number"
    ? { days: input, objective: null, orgId: DEMO_ORG_ID, client: undefined }
    : input;
  const supabase = client ?? createPublicServerClient();
  const now = Date.now();
  const granularity = days === 1 ? "hour" : "day";
  const w = rangeWindow(days, now);
  const windowStart = w.start;
  const previousStart = w.previousStart;

  const [
    rollups,
    prices,
    benchmarks,
    margins,
    models,
    switches,
    org,
    firstEvent,
    storedObjectives,
    subscription,
    pricingSnapshot,
  ] =
    await Promise.all([
      fetchAllRows((f, t) =>
        supabase
          .from("usage_rollups")
          .select(
            "bucket_start, model_key, host, task_hint, requests, input_tokens, output_tokens, cost_usd, output_p50, output_p95",
          )
          .eq("org_id", orgId)
          .eq("granularity", granularity)
          .gte("bucket_start", previousStart)
          .order("bucket_start", { ascending: true })
          .range(f, t),
      ).then((data) => ({ data, error: null })),
      fetchAllRows((f, t) =>
        supabase
          .from("host_prices")
          .select(
            "model_key, host, host_label, input_usd_per_mtok, output_usd_per_mtok, median_latency_ms, median_ttft_ms, output_tps, latency_scope, verified_at",
          )
          // Delisted rows would let the engine recommend a host that no longer
          // sells the model, and a single page would hide most of the market
          // from the comparison entirely.
          .eq("is_active", true)
          .range(f, t),
      ).then((data) => ({ data, error: null })),
      fetchAllRows((f, t) =>
        supabase
          .from("benchmarks")
          .select("model_key, suite, task_class, score")
          .eq("is_fixture", false)
          .range(f, t),
      ).then((data) => ({ data, error: null })),
      supabase
        .from("benchmark_margins")
        .select("suite, task_class, margin, method, synced_at, source_run_id")
        .eq("is_fixture", false),
      fetchAllRows((f, t) =>
        supabase
          .from("model_catalog")
          .select("model_key, display_name, vendor, tier")
          .eq("is_active", true)
          .range(f, t),
      ).then((data) => ({ data, error: null })),
      supabase
        .from("switches")
        .select(
          "id, from_model, from_host, to_model, to_host, basis, badge, autonomous, status, activated_at, saved_usd",
        )
        .eq("org_id", orgId)
        .order("saved_usd", { ascending: false }),
      supabase
        .from("organizations")
        .select("name, plan, is_synthetic, autonomous_enabled")
        .eq("id", orgId)
        .maybeSingle(),
      // Onboarding needs "has this workspace ever ingested anything", which is a
      // different question from "is there traffic in the selected window".
      supabase
        .from("usage_rollups")
        .select("bucket_start")
        .eq("org_id", orgId)
        .order("bucket_start", { ascending: true })
        .limit(1),
      supabase
        .from("objectives")
        .select("model_key, host, task_hint, objective, quality_floor_score, max_latency_ms")
        .eq("org_id", orgId),
      // The plan column records what was bought; this row is what is actually
      // being paid for right now.
      supabase
        .from("subscriptions")
        .select("plan, status, current_period_end, cancel_at_period_end")
        .eq("org_id", orgId)
        .eq("environment", paymentsEnvironment())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      // Freshness is a property of the sync run, not of individual price rows:
      // max(host_prices.verified_at) keeps looking recent even after the feed
      // has stopped running and nothing new was upserted.
      supabase
        .from("pricing_snapshots")
        .select("synced_at")
        .eq("status", "ok")
        .order("synced_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const firstError =
    rollups.error ?? prices.error ?? benchmarks.error ?? margins.error ?? models.error ?? switches.error;
  if (firstError) {
    console.error("dashboard snapshot read failed", firstError);
    throw new Error("Could not load usage data");
  }

  if (!org.data) {
    // RLS returned nothing: either the org does not exist, or the caller is not
    // a member of it. Both are "not yours" as far as the dashboard is concerned.
    throw new Error("Workspace not found");
  }

  // What the workspace may actually use. The recorded plan is never trusted on
  // its own — a paid level has to be backed by a live subscription, or the
  // dashboard locks it exactly as it would for a workspace that never paid.
  // The demo workspace is the one exception: it sells nothing and bills nobody,
  // so it shows every level by design.
  const recordedPlan = org.data.plan as PlanTier;
  const plan = org.data.is_synthetic
    ? recordedPlan
    : effectivePlan(recordedPlan, toSubscriptionState(subscription.data));
  const objective = effectiveSelection(plan, requestedObjective);

  const objectiveRows = mergeObjectives((storedObjectives.data ?? []) as ObjectiveRow[], objective);


  // ---- Series + window totals, split into current and previous window -------
  const buckets = new Map<string, SeriesPoint>();
  const totals = emptyTotals();
  const previous = emptyTotals();

  const split = partitionRollups(rollups.data ?? [], w);

  for (const r of split.previous) addTo(previous, r);

  for (const r of split.current) {
    addTo(totals, r);

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
  }


  const series = [...buckets.values()].map((p) => ({ ...p, spend: round2(p.spend) }));

  const usage = aggregateUsage(split.current as RollupRow[], days);


  // ---- The engine, over exactly the traffic shown above ---------------------
  const priceRows = (prices.data ?? []).map((p) => ({
    model_key: p.model_key,
    host: p.host,
    host_label: p.host_label,
    input_usd_per_mtok: Number(p.input_usd_per_mtok),
    output_usd_per_mtok: Number(p.output_usd_per_mtok),
    median_latency_ms: p.median_latency_ms == null ? null : Number(p.median_latency_ms),
    median_ttft_ms: p.median_ttft_ms == null ? null : Number(p.median_ttft_ms),
    output_tps: p.output_tps == null ? null : Number(p.output_tps),
    latency_scope: (p.latency_scope as "host" | "model" | null) ?? null,
  })) as PriceRow[];

  /**
   * The engine runs over observed traffic only, and that is what keeps
   * "available" and "captured" from ever counting the same dollar twice.
   *
   * A switch accrues `saved_usd` only once the gateway's traffic has actually
   * moved to the new pair — and the moment it moves, the old model|host pair
   * stops appearing in the rollups, so the engine can no longer offer it as an
   * opportunity. While traffic is still on the old pair the switch has saved
   * nothing yet, so the opportunity is genuinely still outstanding. The two
   * figures are therefore disjoint by construction, not by a filter.
   */
  const result = runPipeline({
    usage,
    prices: priceRows,
    benchmarks: (benchmarks.data ?? []).map((b) => ({ ...b, score: Number(b.score) })) as BenchmarkRow[],
    margins: (margins.data ?? []).map((m) => ({ ...m, margin: Number(m.margin) })) as MarginRow[],
    models: (models.data ?? []) as ModelRow[],
    objectives: objectiveRows,
  });

  const toOpportunity = (r: Recommendation): SwitchOpportunity => ({
    fromModel: r.fromModel,
    fromHost: r.fromHost,
    fromHostLabel: r.fromHostLabel,
    toModel: r.toModel ?? r.fromModel,
    toHost: r.toHost ?? r.fromHost,
    toHostLabel: r.toHostLabel ?? r.fromHostLabel,
    taskHint: r.taskHint,
    saving: round2(r.savingUsd),
    monthlySaving: round2(r.monthlySavingUsd),
    savingPct: pct1(r.savingPct),
    basis: r.basis,
    note: r.note,
    qualityDelta: r.qualityDelta,
  });

  // ---- Plan gating: the check always runs, the detail is what a plan buys ----
  const arbitrageLevel = gateLevel(
    "host_arbitrage",
    plan,
    result.hostArbitrage.map(toOpportunity),
    (r) => r.saving,
  );
  const qualityLevel = gateLevel(
    "quality_match",
    plan,
    result.qualityMatched.map(toOpportunity),
    (r) => r.saving,
  );
  const oversizedLevel = gateLevel(
    "rightsize",
    plan,
    result.oversized.map(
      (r): OversizedWorkload => ({
        model: r.fromModel,
        host: r.fromHostLabel || r.fromHost,
        hostKey: r.fromHost,
        task: r.taskHint,
        toModel: r.toModel,
        wasted: round2(r.savingUsd),
        wastedMonthly: round2(r.monthlySavingUsd),
        savingPct: pct1(r.savingPct),
        note: r.note,
      }),
    ),
    (o) => o.wasted,
  );

  const hostArbitrage = arbitrageLevel.items;
  const qualityMatched = qualityLevel.items;
  const oversized = oversizedLevel.items;

  /**
   * Every money figure below is a real sum over the selected window.
   *
   * There is deliberately no second, fixed 30-day basis any more. Anchoring
   * the headline to 30 days while the lists underneath moved with the toggle
   * is what produced the impossible reading this module was rewritten for: a
   * 7-day tab claiming more available saving than the 30-day tab, because the
   * per-window numbers were daily rates multiplied back out to a month. A
   * shorter window now always shows less money, because less money happened.
   */

  /**
   * Month-end forecast history.
   *
   * The forecaster needs both the whole month-to-date and a 28-day trailing
   * window for day-of-week factors, which reaches further back than the
   * 30-day baseline on the last days of a long month. 40 days covers both.
   */
  const forecastStart = new Date(now - 40 * DAY_MS).toISOString();
  const { data: forecastData } =
    await supabase
      .from("usage_rollups")
      .select("bucket_start, model_key, host, task_hint, cost_usd")
      .eq("org_id", orgId)
      .eq("granularity", "day")
      .gte("bucket_start", forecastStart)
      .limit(100_000);
  /**
   * Hourly coverage, the real signal behind "is this a day or a fragment".
   * Read from the hour-granularity rollups: distinct hour buckets per day.
   * The hourly rollups have their own retention horizon, so only days from
   * the first *complete* hourly day onwards are judged; earlier days keep the
   * benefit of the doubt instead of being falsely called partial.
   */
  const { data: hourRows } =
    await supabase
      .from("usage_rollups")
      .select("bucket_start")
      .eq("org_id", orgId)
      .eq("granularity", "hour")
      .gte("bucket_start", new Date(now - 40 * DAY_MS).toISOString())
      .limit(100_000);
  const hoursByDay = new Map<string, Set<string>>();
  for (const r of hourRows ?? []) {
    const iso = String(r.bucket_start);
    const day = iso.slice(0, 10);
    const hour = iso.slice(11, 13);
    let s = hoursByDay.get(day);
    if (!s) hoursByDay.set(day, (s = new Set()));
    s.add(hour);
  }
  const hourCoverage: Record<string, number> = {};
  for (const [day, hours] of hoursByDay) hourCoverage[day] = hours.size;
  const firstHourDay = [...hoursByDay.keys()].sort()[0];
  const coverageReliableFrom = firstHourDay
    ? new Date(Date.parse(`${firstHourDay}T00:00:00.000Z`) + DAY_MS).toISOString().slice(0, 10)
    : undefined;
  /**
   * The interlock: the projection refuses to compute through a day the
   * collectors never ran, read from the same `sync_runs` ledger the platform
   * already uses to prove sync health.
   */
  const forecastSyncGaps = await syncGapDays(now, FORECAST_RULES.levelDays);
  const forecast = forecastMonthEnd(
    (forecastData ?? []).map((r) => ({
      date: String(r.bucket_start).slice(0, 10),
      key: `${r.model_key}|${r.host}|${r.task_hint}`,
      spend: Number(r.cost_usd),
    })),
    new Date(now),
    { syncGapDates: forecastSyncGaps, hourCoverage, coverageReliableFrom },
  );





  /** Trailing 30 days of spend, shown only next to the month-end projection. */
  const spend30d = (forecastData ?? [])
    .filter((r) => String(r.bucket_start) >= new Date(now - 30 * DAY_MS).toISOString())
    .reduce((sum, r) => sum + Number(r.cost_usd), 0);

  // ---- What is already running, inside the selected window -------------------
  const toSwitchRow = (s: {
    id: string;
    from_model: string;
    from_host: string;
    to_model: string;
    to_host: string;
    badge: string;
    basis: string;
    activated_at: string;
    saved_usd: number | string;
    autonomous: boolean;
  }): ActiveSwitchRow => {
    // Whole elapsed days, not fractional: a run-rate that moves every second
    // makes the same figure disagree between server render and client, and
    // between two pages read a moment apart.
    const activeDays = Math.max(1, Math.floor((now - new Date(s.activated_at).getTime()) / DAY_MS));
    return {
      switchId: s.id,
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
  };

  const activeSwitches: ActiveSwitchRow[] = selectSwitchesInWindow(
    (switches.data ?? []).filter((s) => s.status === "active"),
    w,
  ).map(toSwitchRow);

  /** Switches running from before the window — real, but not this window's news. */
  const switchesOutsideWindow =
    (switches.data ?? []).filter((s) => s.status === "active").length - activeSwitches.length;

  /** Paused switches in the window — shown so they can be resumed or rolled back. */
  const frozenSwitches: ActiveSwitchRow[] = selectSwitchesInWindow(
    (switches.data ?? []).filter((s) => s.status === "paused"),
    w,
  ).map(toSwitchRow);
  const frozen = frozenSwitches.length;

  // ---- Reconciliation: current ledger rows only (append-only history behind) --
  const reconciliation: ReconciliationRow[] = [];
  const { data: allCaptures } = await supabase
    .from("billing_captures")
    .select("id, provider, period_start, period_end")
    .eq("org_id", orgId)
    .order("period_end", { ascending: false })
    .limit(24);
  const captures = selectCapturesInWindow(allCaptures ?? [], w).slice(0, 6);
  if (captures.length) {
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
  const reconciliationOutsideWindow = (allCaptures ?? []).length - captures.length;

  // ---- Coverage honesty ------------------------------------------------------
  const pricedPairs = new Set(priceRows.map((p) => `${p.model_key}|${p.host}`));
  const untracked = new Set(
    usage.filter((u) => !pricedPairs.has(`${u.model_key}|${u.host}`)).map((u) => u.model_key),
  );
  const lastPricingSync = pricingSnapshot.data?.synced_at ?? null;

  /**
   * ---- The money, added up once ------------------------------------------
   *
   * Real sums over the selected window, deduped to one best switch per
   * workload: arbitrage, the quality check and the right-size check all run
   * over the same traffic, so adding the three lists together counted the same
   * workload's money up to three times.
   */
  const wl = (o: { fromModel: string; fromHost: string; taskHint: string }) =>
    `${o.fromModel}|${o.fromHost}|${o.taskHint}`;
  const savingsTotals = aggregateSavings([
    ...result.hostArbitrage.map((r) => ({
      key: wl(r),
      saving: r.savingUsd,
      unlocked: arbitrageLevel.unlocked,
    })),
    ...result.qualityMatched.map((r) => ({
      key: wl(r),
      saving: r.savingUsd,
      unlocked: qualityLevel.unlocked,
    })),
    ...result.oversized.map((r) => ({
      key: wl(r),
      saving: r.savingUsd,
      unlocked: oversizedLevel.unlocked,
    })),
  ]);

  /**
   * Everything running right now is saving money, whatever day it was switched
   * on — but only the part of that saving which falls inside the window counts
   * here, so the captured figure shrinks with the window exactly like the
   * available figure does.
   */
  const runningSwitches = (switches.data ?? [])
    .filter((s) => s.status === "active")
    .map(toSwitchRow);
  const captured = capturedInWindow(
    runningSwitches.map((s) => ({
      saved: s.saved,
      activeDays: Math.max(
        1,
        Math.floor((now - new Date(s.activatedAt).getTime()) / DAY_MS),
      ),
    })),
    days,
  );
  /** Present-tense run rate. Only ever rendered where "/mo" is written next to it. */
  const activeMonthlyRate = round2(runningSwitches.reduce((s, a) => s + a.monthlyRate, 0));

  /**
   * ---- Govern: what would run unattended, and what refuses to -------------
   *
   * The same engine output the manual levels use, run through the real
   * autonomous gate. The gate is evaluated with `enabled: true` on purpose:
   * the question this page answers is "which of these are safe to run without
   * me?", and answering it with "autonomous mode is off" for every row would
   * tell the workspace nothing. Whether anything actually fires is decided by
   * `autonomousEnabled` (below) plus the Govern plan, in the writer.
   */
  const lastAutonomousAt =
    (switches.data ?? [])
      .filter((s) => s.autonomous && s.activated_at)
      .map((s) => new Date(s.activated_at).getTime())
      .sort((a, b) => b - a)[0] ?? null;

  const governPolicy = { ...DEFAULT_AUTONOMOUS_POLICY, enabled: true };
  const governEligible: GovernCandidate[] = [];
  const governRefusals: GovernRefusal[] = [];
  for (const rec of [...result.hostArbitrage, ...result.qualityMatched, ...result.oversized]) {
    if (!rec.toModel || !rec.toHost) continue;
    const verdict = evaluateAutonomous(rec, governPolicy, {
      now: new Date(now),
      lastAutonomousChangeAt: lastAutonomousAt ? new Date(lastAutonomousAt) : null,
    });
    const base = {
      kind: rec.kind,
      fromModel: rec.fromModel,
      fromHost: rec.fromHostLabel || rec.fromHost,
      toModel: rec.toModel,
      toHost: rec.toHostLabel || rec.toHost,
      taskHint: rec.taskHint,
      saving: round2(rec.savingUsd),
      monthlySaving: round2(rec.monthlySavingUsd),
      basis: rec.basis,
    };
    if (verdict.allowed) governEligible.push(base);
    else governRefusals.push({ ...base, reason: verdict.reason, detail: verdict.detail });
  }
  /**
   * One workload, one autonomous switch. A workload can clear the gate as
   * arbitrage *and* as a quality match; only the better of the two can ever be
   * applied, so summing both would promise money twice — the same double count
   * `aggregateSavings` removes from the headline.
   */
  const dedupeByWorkload = <T extends { fromModel: string; fromHost: string; taskHint: string; saving: number }>(
    rows: T[],
  ) => {
    const best = new Map<string, T>();
    for (const r of rows) {
      const key = `${r.fromModel}|${r.fromHost}|${r.taskHint}`;
      const seen = best.get(key);
      if (!seen || r.saving > seen.saving) best.set(key, r);
    }
    return [...best.values()];
  };
  const governEligibleUnique = dedupeByWorkload(governEligible);
  governEligibleUnique.sort((a, b) => b.saving - a.saving);
  governEligible.length = 0;
  governEligible.push(...governEligibleUnique);
  governRefusals.sort((a, b) => b.saving - a.saving);

  /**
   * List C. Every workload the equivalence check evaluated and refused, with
   * the engine's own verdict code — never invented copy — and what that
   * workload costs per month, so a refusal can be weighed against its bill.
   */
  const usageByKey = new Map(usage.map((u) => [`${u.model_key}|${u.host}|${u.task_hint}`, u]));
  const nonQualifying: NonQualifyingWorkload[] = result.refusals
    .map((r) => {
      const u = usageByKey.get(`${r.fromModel}|${r.fromHost}|${r.taskHint}`);
      const monthlySpend = u ? round2((u.cost_usd / Math.max(1, u.days)) * 30) : 0;
      return {
        fromModel: r.fromModel,
        fromHost: r.fromHost,
        taskHint: r.taskHint,
        reason: r.reason,
        label: REFUSAL_LABEL[r.reason] ?? r.reason.replace(/_/g, " "),
        detail: r.detail,
        monthlySpend,
      };
    })
    .sort((a, b) => b.monthlySpend - a.monthlySpend);


  /** One shared statement of how the four levels' counts relate. */
  const composition = buildComposition({
    arbitrageCount: hostArbitrage.length,
    qualityCount: qualityMatched.length,
    oversizedCount: oversized.length,
    eligibleCount: governEligible.length,
    refusedCount: governRefusals.length,
  });

  const autonomousEnabled = Boolean((org.data as { autonomous_enabled?: boolean }).autonomous_enabled);
  const autonomousSwitches = runningSwitches.filter((s) => s.autonomous);
  const autonomousRunning = autonomousSwitches.length;
  /**
   * What Govern itself applied, measured the same way every other captured
   * figure is: real dollars saved inside the window by switches that were
   * activated unattended. Govern finds nothing of its own, so counting
   * "opportunities" for it would always read zero.
   */
  const autonomousCaptured = capturedInWindow(
    autonomousSwitches.map((s) => ({
      saved: s.saved,
      activeDays: Math.max(1, Math.floor((now - new Date(s.activatedAt).getTime()) / DAY_MS)),
    })),
    days,
  );

  const dataState: DataState = deriveDataState({
    hasEverIngested: (firstEvent.data ?? []).length > 0,
    rowsInWindow: split.current.length,
  });

  /**
   * Whether anything can still reach us. Read separately from the figures
   * above precisely because it is the one thing the figures cannot say.
   */
  const ingest = await ingestConnection(orgId, now);





  return {
    days,
    generatedAt: new Date(now).toISOString(),
    workspace: {
      id: orgId,
      name: org.data.name,
      plan,
      // What was bought vs. what is still being paid for. When these differ the
      // level is locked and the workspace can see exactly why.
      recordedPlan,
      billingStatus: (subscription.data?.status as string | null) ?? null,
    },
    plan,
    upgradePlan: nextPlan(plan),
    objective,
    dataState,
    firstEventAt: (firstEvent.data ?? [])[0]?.bucket_start ?? null,
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
    nonQualifying,

    hostArbitrage,
    qualityMatched,
    oversized,
    levels: {
      host_arbitrage: {
        unlocked: arbitrageLevel.unlocked,
        requiredPlan: arbitrageLevel.requiredPlan,
        lockedCount: arbitrageLevel.lockedCount,
        lockedSaving: round2(arbitrageLevel.lockedSaving),
      },
      quality_match: {
        unlocked: qualityLevel.unlocked,
        requiredPlan: qualityLevel.requiredPlan,
        lockedCount: qualityLevel.lockedCount,
        lockedSaving: round2(qualityLevel.lockedSaving),
      },
      rightsize: {
        unlocked: oversizedLevel.unlocked,
        requiredPlan: oversizedLevel.requiredPlan,
        lockedCount: oversizedLevel.lockedCount,
        lockedSaving: round2(oversizedLevel.lockedSaving),
      },
    },
    activeSwitches,
    frozenSwitches,
    switchesOutsideWindow,
    frozen,
    /**
     * Govern. `unlocked` is the plan; `enabled` is the workspace's own switch.
     * Both must be true before anything runs unattended — the plan alone has
     * never been consent.
     */
    govern: {
      unlocked: plan === "govern",
      enabled: autonomousEnabled,
      running: autonomousRunning,
      /** Real dollars applied unattended inside the window. */
      captured: autonomousCaptured,
      lastAutonomousAt: lastAutonomousAt ? new Date(lastAutonomousAt).toISOString() : null,
      eligible: governEligible,
      refusals: governRefusals,
      /** Real dollars over the window; the run-rate stays available separately. */
      eligibleSaving: round2(governEligible.reduce((s, c) => s + c.saving, 0)),
      eligibleMonthly: round2(governEligible.reduce((s, c) => s + c.monthlySaving, 0)),
      policy: {
        minMonthlySavingUsd: DEFAULT_AUTONOMOUS_POLICY.minMonthlySavingUsd,
        cooldownHours: DEFAULT_AUTONOMOUS_POLICY.cooldownHours,
      },
    },

    composition,



    /**
     * Every figure here is a real sum over the selected window — no run-rates,
     * no extrapolation — and every workload contributes at most once.
     */
    savings: {
      windowDays: days,
      captured,
      available: savingsTotals.available,
      locked: savingsTotals.locked,
      certifiedCount: savingsTotals.certifiedCount,
      /** Naive list sum and the double count it hides, stated rather than hidden. */
      gross: savingsTotals.gross,
      overlapUsd: savingsTotals.overlapUsd,
      overlapCount: savingsTotals.overlapCount,
      savedToDate: round2(runningSwitches.reduce((s, a) => s + a.saved, 0)),
      /** Labelled run-rate. Never mix this into a window total. */
      activeMonthlyRate,
    },
    /**
     * One month-end forecast on every tab: month-to-date actual plus a
     * trailing 7-day level, weekly factors when the pattern is real, a damped
     * trend, and a range whenever the data does not support a single number.
     */
    projection: {
      monthEndUsd: forecast.pointUsd,
      lowUsd: forecast.lowUsd,
      highUsd: forecast.highUsd,
      isRange: forecast.isRange,
      /** No figure at all when the data cannot support a coherent one. */
      suppressed: forecast.suppressed,
      suppressionReason: forecast.suppressionReason,
      observedLevelDays: forecast.observedLevelDays,
      missingLevelDates: forecast.missingLevelDates,
      partialLevelDates: forecast.partialLevelDates,

      syncGapDates: forecast.syncGapDates,

      mtdUsd: forecast.mtdUsd,
      remainingDays: forecast.remainingDays,
      dailyLevelUsd: forecast.dailyLevelUsd,
      seasonalityApplied: forecast.seasonalityApplied,
      retiredWorkloads: forecast.retiredKeys.length,
      newWorkloads: forecast.newKeys.length,
      reasons: forecast.reasons,
      /** Trailing window behind the projected days. */
      basisDays: 7,
      /** Kept for the 30-day run-rate comparison shown alongside. */
      runRate30dUsd: round2(spend30d),
    },

    reconciliation,
    reconciliationOutsideWindow,

    coverage: {
      untrackedModels: untracked.size,
      pricesSyncedAgo: relativeAgo(lastPricingSync, now),
      evaluations: (margins.data ?? []).length,
    },
  };
}


export type DashboardSnapshot = Awaited<ReturnType<typeof buildDashboardSnapshot>>;
