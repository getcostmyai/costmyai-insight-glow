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
import { MAX_CATALOG_ROWS } from "@/lib/catalog-limits";


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
  /** Raw provider key behind the label — right-sizing stays on the same host. */
  hostKey: string;
  task: string;
  toModel: string | null;
  wasted: number;
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
      supabase
        .from("usage_rollups")
        .select(
          "bucket_start, model_key, host, task_hint, requests, input_tokens, output_tokens, cost_usd, output_p50, output_p95",
        )
        .eq("org_id", orgId)
        .eq("granularity", granularity)
        .gte("bucket_start", previousStart)
        .order("bucket_start", { ascending: true })
        .limit(100_000),
      supabase
        .from("host_prices")
        .select(
          "model_key, host, host_label, input_usd_per_mtok, output_usd_per_mtok, median_latency_ms, median_ttft_ms, output_tps, latency_scope, verified_at",
        )
        // Delisted rows would let the engine recommend a host that no longer
        // sells the model, and the default 1000-row page would hide most of
        // the market from the comparison entirely.
        .eq("is_active", true)
        .limit(MAX_CATALOG_ROWS),
      supabase
        .from("benchmarks")
        .select("model_key, suite, task_class, score")
        .eq("is_fixture", false)
        .limit(MAX_CATALOG_ROWS),
      supabase
        .from("benchmark_margins")
        .select("suite, task_class, margin, method, synced_at, source_run_id")
        .eq("is_fixture", false),
      supabase
        .from("model_catalog")
        .select("model_key, display_name, vendor, tier")
        .eq("is_active", true)
        .limit(MAX_CATALOG_ROWS),
      supabase
        .from("switches")
        .select(
          "id, from_model, from_host, to_model, to_host, basis, badge, autonomous, status, activated_at, saved_usd",
        )
        .eq("org_id", orgId)
        .order("saved_usd", { ascending: false }),
      supabase.from("organizations").select("name, plan, is_synthetic").eq("id", orgId).maybeSingle(),
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
    monthlySaving: round2(r.monthlySavingUsd),
    savingPct: Math.round(r.savingPct),
    basis: r.basis,
    note: r.note,
    qualityDelta: r.qualityDelta,
  });

  // ---- Plan gating: the check always runs, the detail is what a plan buys ----
  const arbitrageLevel = gateLevel(
    "host_arbitrage",
    plan,
    result.hostArbitrage.map(toOpportunity),
    (r) => r.monthlySaving,
  );
  const qualityLevel = gateLevel(
    "quality_match",
    plan,
    result.qualityMatched.map(toOpportunity),
    (r) => r.monthlySaving,
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
        wasted: round2(r.monthlySavingUsd),
        savingPct: Math.round(r.savingPct),
        note: r.note,
      }),
    ),
    (o) => o.wasted,
  );

  const hostArbitrage = arbitrageLevel.items;
  const qualityMatched = qualityLevel.items;
  const oversized = oversizedLevel.items;

  /**
   * The headline claim and the month-end projection are NOT window-dependent.
   *
   * The 24h/7d/30d toggle governs what traffic and which lists you are looking
   * at. It must not silently redefine "what you can stop paying" or "where this
   * month lands" — those swung by thousands of dollars purely because a user
   * clicked a different tab. Both are anchored to one fixed 30-day basis, the
   * same basis on every tab.
   */
  const baselineDays = 30;
  const baselineStart = new Date(now - baselineDays * DAY_MS).toISOString();
  let baselineRows: RollupRow[];
  if (days === baselineDays) {
    baselineRows = split.current as RollupRow[];
  } else {
    const { data } = await supabase
      .from("usage_rollups")
      .select(
        "bucket_start, model_key, host, task_hint, requests, input_tokens, output_tokens, cost_usd, output_p50, output_p95",
      )
      .eq("org_id", orgId)
      .eq("granularity", "day")
      .gte("bucket_start", baselineStart)
      .limit(100_000);
    baselineRows = (data ?? []) as RollupRow[];
  }

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
  const forecast = forecastMonthEnd(
    (forecastData ?? []).map((r) => ({
      date: String(r.bucket_start).slice(0, 10),
      key: `${r.model_key}|${r.host}|${r.task_hint}`,
      spend: Number(r.cost_usd),
    })),
    new Date(now),
  );



  const baselineSpend = baselineRows.reduce((s, r) => s + Number(r.cost_usd), 0);
  const baselineResult =
    days === baselineDays
      ? result
      : runPipeline({
          usage: aggregateUsage(baselineRows, baselineDays),
          prices: priceRows,
          benchmarks: (benchmarks.data ?? []).map((b) => ({
            ...b,
            score: Number(b.score),
          })) as BenchmarkRow[],
          margins: (margins.data ?? []).map((m) => ({ ...m, margin: Number(m.margin) })) as MarginRow[],
          models: (models.data ?? []) as ModelRow[],
          objectives: objectiveRows,
        });

  const baselineArbitrage = gateLevel(
    "host_arbitrage",
    plan,
    baselineResult.hostArbitrage.map(toOpportunity),
    (r) => r.monthlySaving,
  );
  const baselineQuality = gateLevel(
    "quality_match",
    plan,
    baselineResult.qualityMatched.map(toOpportunity),
    (r) => r.monthlySaving,
  );
  const baselineOversized = gateLevel(
    "rightsize",
    plan,
    baselineResult.oversized.map((r) => ({ wasted: round2(r.monthlySavingUsd) })),
    (o) => o.wasted,
  );


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
    const activeDays = Math.max(1, (now - new Date(s.activated_at).getTime()) / DAY_MS);
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

  /** Window-scoped opportunity — matches exactly the lists rendered below the hero. */
  const windowAvailableMonthly = round2(
    arbitrageLevel.unlockedMonthly + qualityLevel.unlockedMonthly + oversizedLevel.unlockedMonthly,
  );
  const windowLockedMonthly = round2(
    arbitrageLevel.lockedMonthly + qualityLevel.lockedMonthly + oversizedLevel.lockedMonthly,
  );

  /** Headline claim — fixed 30-day basis, identical on every tab. */
  const availableMonthly = round2(
    baselineArbitrage.unlockedMonthly + baselineQuality.unlockedMonthly + baselineOversized.unlockedMonthly,
  );
  const lockedMonthly = round2(
    baselineArbitrage.lockedMonthly + baselineQuality.lockedMonthly + baselineOversized.lockedMonthly,
  );

  /**
   * Everything running right now is saving money right now, whatever day it was
   * switched on. Filtering the capture rate by activation date reported 0%
   * captured on the 7d and 24h tabs while two switches were actively saving
   * ~$1.3k/mo — the rate is a present-tense fact, not this window's news.
   */
  const runningSwitches = (switches.data ?? [])
    .filter((s) => s.status === "active")
    .map(toSwitchRow);
  const activeMonthly = round2(runningSwitches.reduce((s, a) => s + a.monthlyRate, 0));


  const dataState: DataState = deriveDataState({
    hasEverIngested: (firstEvent.data ?? []).length > 0,
    rowsInWindow: split.current.length,
  });

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
    hostArbitrage,
    qualityMatched,
    oversized,
    levels: {
      host_arbitrage: {
        unlocked: arbitrageLevel.unlocked,
        requiredPlan: arbitrageLevel.requiredPlan,
        lockedCount: arbitrageLevel.lockedCount,
        lockedMonthly: round2(arbitrageLevel.lockedMonthly),
      },
      quality_match: {
        unlocked: qualityLevel.unlocked,
        requiredPlan: qualityLevel.requiredPlan,
        lockedCount: qualityLevel.lockedCount,
        lockedMonthly: round2(qualityLevel.lockedMonthly),
      },
      rightsize: {
        unlocked: oversizedLevel.unlocked,
        requiredPlan: oversizedLevel.requiredPlan,
        lockedCount: oversizedLevel.lockedCount,
        lockedMonthly: round2(oversizedLevel.lockedMonthly),
      },
    },
    activeSwitches,
    frozenSwitches,
    switchesOutsideWindow,
    frozen,
    savings: {
      activeMonthly,
      availableMonthly,
      lockedMonthly,
      certifiedCount: baselineArbitrage.items.length + baselineQuality.items.length,
      savedToDate: round2(runningSwitches.reduce((s, a) => s + a.saved, 0)),
      /** Same figures scoped to the selected window — what the lists below add up to. */
      windowAvailableMonthly,
      windowLockedMonthly,
      windowCertifiedCount: hostArbitrage.length + qualityMatched.length,
      /** How the headline and projection are derived, so the UI can say so. */
      basisDays: baselineDays,
    },
    /** One month-end projection, from the fixed 30-day run rate, on every tab. */
    projection: {
      monthEndUsd: round2(baselineSpend),
      basisDays: baselineDays,
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
