import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { effectivePlan, type SubscriptionState } from "../billing/entitlement";
import { paymentsEnvironment } from "../billing/env.server";
import {
  DEFAULT_AUTONOMOUS_POLICY,
  evaluateAutonomous,
  workloadKey,
  type ActiveDestination,
} from "./autonomous";

import type { ObjectiveRow } from "./objectives";
import { runPipeline } from "./pipeline";
import type {
  BenchmarkRow,
  MarginRow,
  ModelRow,
  PriceRow,
  Recommendation,
  UsageAggregate,
} from "./types";

/**
 * The autonomous writer — the engine running on a schedule instead of a page load.
 *
 * Chained to BOTH syncs, deliberately:
 *   • after the pricing sync (every 3 minutes) so a price-driven opportunity is
 *     caught inside its own window rather than whenever somebody opens a tab;
 *   • after the benchmark sync (daily) so a benchmark-driven one is caught the
 *     day the measurement moves.
 * Either input can change a verdict on its own, so chaining to one and not the
 * other would leave a whole class of change permanently unseen.
 *
 * Everything it writes goes through `system_upsert_recommendation` and
 * `system_apply_switch`: SECURITY DEFINER, service_role-only, and carrying the
 * same refusals as the human path — the demo workspace is read-only, a workload
 * with an active switch is never switched again, and autonomy is gated on the
 * Govern level being genuinely paid for. No promotional bypass exists here.
 */

const EVALUATION_WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;

const MIN_PLAN = {
  host_arbitrage: "compare",
  quality_match: "certify",
  rightsize: "rightsize",
} as const;

export interface EvaluationReport {
  orgs: number;
  recommendationsWritten: number;
  autonomousSwitches: number;
  autonomousRefusals: Record<string, number>;
  errors: string[];
}

interface OrgRow {
  id: string;
  plan: string;
  is_synthetic: boolean;
  autonomous_enabled: boolean;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
}

/**
 * Recompute every real workspace's recommendations from current prices,
 * benchmarks and traffic, then let Govern act where it is allowed to.
 */
export async function runEvaluation(trigger: string): Promise<EvaluationReport> {
  const report: EvaluationReport = {
    orgs: 0,
    recommendationsWritten: 0,
    autonomousSwitches: 0,
    autonomousRefusals: {},
    errors: [],
  };

  const since = new Date(Date.now() - EVALUATION_WINDOW_DAYS * DAY_MS).toISOString();

  // Reference data is identical for every workspace: read it once, and read
  // all of it — the catalogue is past the data API's 1000-row page ceiling, so
  // an unpaged read silently hands the engine a partial market.
  const { fetchAllRows } = await import("../paginate.server");

  const [orgs, prices, benchmarks, margins, models] = await Promise.all([
    // The synthetic workspace is evaluated too. It is the only standing body of
    // realistic traffic we have, and skipping it meant the scheduled writer had
    // nothing to write against. Its output is stamped is_synthetic at the
    // database boundary, and the human switch paths stay read-only for it.
    supabaseAdmin.from("organizations").select("id, plan, is_synthetic, autonomous_enabled"),
    fetchAllRows((from, to) =>
      supabaseAdmin
        .from("host_prices")
        .select(
          "model_key, host, host_label, input_usd_per_mtok, output_usd_per_mtok, cache_read_usd_per_mtok, cache_write_usd_per_mtok, supports_prompt_caching, median_latency_ms, median_ttft_ms, output_tps, latency_scope",
        )
        // Delisted rows keep their last observed price for audit. Quoting one
        // as a switch destination would recommend a host that no longer sells
        // the model at a price nobody can buy.
        .eq("is_active", true)
        .range(from, to),
    ).then((data) => ({ data, error: null })),
    fetchAllRows((from, to) =>
      supabaseAdmin
        .from("benchmarks")
        .select("model_key, suite, task_class, score")
        .eq("is_fixture", false)
        .range(from, to),
    ).then((data) => ({ data, error: null })),
    fetchAllRows((from, to) =>
      supabaseAdmin
        .from("benchmark_margins")
        .select("suite, task_class, margin, method, synced_at, source_run_id")
        .eq("is_fixture", false)
        .range(from, to),
    ).then((data) => ({ data, error: null })),
    fetchAllRows((from, to) =>
      supabaseAdmin
        .from("model_catalog")
        .select("model_key, display_name, vendor, tier")
        .eq("is_active", true)
        .range(from, to),
    ).then((data) => ({ data, error: null })),
  ]);


  const readError = orgs.error ?? prices.error ?? benchmarks.error ?? margins.error ?? models.error;
  if (readError) throw new Error(`evaluation could not read reference data: ${readError.message}`);

  const priceRows = (prices.data ?? []).map((p) => ({
    ...p,
    input_usd_per_mtok: Number(p.input_usd_per_mtok),
    output_usd_per_mtok: Number(p.output_usd_per_mtok),
    // Null must survive the cast. `Number(null)` is 0, which would tell the
    // engine this host serves cached input for free and invent a saving.
    cache_read_usd_per_mtok:
      p.cache_read_usd_per_mtok == null ? null : Number(p.cache_read_usd_per_mtok),
    cache_write_usd_per_mtok:
      p.cache_write_usd_per_mtok == null ? null : Number(p.cache_write_usd_per_mtok),
    median_latency_ms: p.median_latency_ms == null ? null : Number(p.median_latency_ms),
    median_ttft_ms: p.median_ttft_ms == null ? null : Number(p.median_ttft_ms),
    output_tps: p.output_tps == null ? null : Number(p.output_tps),
  })) as PriceRow[];
  const benchmarkRows = (benchmarks.data ?? []).map((b) => ({
    ...b,
    score: Number(b.score),
  })) as BenchmarkRow[];
  const marginRows = (margins.data ?? []).map((m) => ({
    ...m,
    margin: Number(m.margin),
  })) as MarginRow[];
  const modelRows = (models.data ?? []) as ModelRow[];

  const env = paymentsEnvironment();

  for (const org of (orgs.data ?? []) as OrgRow[]) {
    try {
      report.orgs += 1;
      await evaluateOrg(org, {
        since,
        env,
        prices: priceRows,
        benchmarks: benchmarkRows,
        margins: marginRows,
        models: modelRows,
        report,
      });
    } catch (err) {
      report.errors.push(`${org.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(
    `[evaluation:${trigger}] orgs=${report.orgs} written=${report.recommendationsWritten} autonomous=${report.autonomousSwitches} errors=${report.errors.length}`,
  );
  return report;
}

async function evaluateOrg(
  org: OrgRow,
  ctx: {
    since: string;
    env: string;
    prices: PriceRow[];
    benchmarks: BenchmarkRow[];
    margins: MarginRow[];
    models: ModelRow[];
    report: EvaluationReport;
  },
): Promise<void> {
  const { fetchAllRows } = await import("../paginate.server");

  const [rollups, objectives, subscription] = await Promise.all([
    // 30 days x every workload x every host is well past one page; a truncated
    // read here would quietly understate the workspace's spend.
    fetchAllRows((from, to) =>
      supabaseAdmin
        .from("usage_rollups")
        .select(
          "model_key, host, task_hint, requests, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, output_p50, output_p95",
        )
        .eq("org_id", org.id)
        .eq("granularity", "day")
        .gte("bucket_start", ctx.since)
        .range(from, to),
    ).then((data) => ({ data, error: null })),

    supabaseAdmin
      .from("objectives")
      .select("model_key, host, task_hint, objective, quality_floor_score, max_latency_ms")
      .eq("org_id", org.id),
    supabaseAdmin
      .from("subscriptions")
      .select("plan, status, current_period_end, cancel_at_period_end")
      .eq("org_id", org.id)
      .eq("environment", ctx.env)
      .maybeSingle(),
  ]);

  // fetchAllRows throws on a read error, so reaching here means the read was whole.
  if (!rollups.data || rollups.data.length === 0) return; // no traffic, nothing to say


  const shapes = new Map<string, { p50: number[]; p95: number[] }>();
  const byWorkload = new Map<string, UsageAggregate>();
  for (const r of rollups.data) {
    const key = `${r.model_key}|${r.host}|${r.task_hint}`;
    const agg = byWorkload.get(key) ?? {
      model_key: r.model_key,
      host: r.host,
      task_hint: r.task_hint,
      requests: 0,
      input_tokens: 0,
      output_tokens: 0,
      // Dispatch 204. Kept per workload so a candidate host is priced against
      // the cache mix this workload actually exhibits, not a flat assumption.
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      cost_usd: 0,
      days: EVALUATION_WINDOW_DAYS,
    };
    agg.requests += Number(r.requests);
    agg.input_tokens += Number(r.input_tokens);
    agg.output_tokens += Number(r.output_tokens);
    agg.cache_read_tokens = (agg.cache_read_tokens ?? 0) + Number(r.cache_read_tokens ?? 0);
    agg.cache_write_tokens = (agg.cache_write_tokens ?? 0) + Number(r.cache_write_tokens ?? 0);
    agg.cost_usd += Number(r.cost_usd);
    byWorkload.set(key, agg);

    const shape = shapes.get(key) ?? { p50: [], p95: [] };
    if (r.output_p50) shape.p50.push(Number(r.output_p50));
    if (r.output_p95) shape.p95.push(Number(r.output_p95));
    shapes.set(key, shape);
  }

  const usage = [...byWorkload.entries()].map(([key, u]) => ({
    ...u,
    output_p50: median(shapes.get(key)?.p50 ?? []),
    output_p95: median(shapes.get(key)?.p95 ?? []),
  }));

  const result = runPipeline({
    usage,
    prices: ctx.prices,
    benchmarks: ctx.benchmarks,
    margins: ctx.margins,
    models: ctx.models,
    objectives: (objectives.data ?? []) as ObjectiveRow[],
  });

  const subState: SubscriptionState | null = subscription.data
    ? {
        plan: subscription.data.plan as SubscriptionState["plan"],
        status: subscription.data.status as string,
        currentPeriodEnd: (subscription.data.current_period_end as string | null) ?? null,
        cancelAtPeriodEnd: Boolean(subscription.data.cancel_at_period_end),
      }
    : null;

  // The recorded level is never trusted alone — a paid level has to be backed
  // by a live subscription, exactly as the dashboard gates it.
  const plan = effectivePlan(org.plan as SubscriptionState["plan"], subState);

  const batches: Array<[keyof typeof MIN_PLAN, Recommendation[]]> = [
    ["host_arbitrage", result.hostArbitrage],
    ["quality_match", result.qualityMatched],
    ["rightsize", result.oversized],
  ];

  /**
   * Dispatch 187. Both guards are now scoped to the workload, not the
   * workspace: the cooldown clock and the incumbent destination are looked up
   * per (org, from_model, from_host) — the same identity the database's
   * one-active-switch constraint already uses.
   */
  const cooldowns = await lastAutonomousChangeByWorkload(org.id);
  const incumbents = await activeDestinations(org.id);

  const cycleStart = new Date().toISOString();

  for (const [kind, recs] of batches) {
    for (const rec of recs) {
      if (!rec.toModel || !rec.toHost) continue;

      const { data: recId, error } = await supabaseAdmin.rpc("system_upsert_recommendation", {
        _org_id: org.id,
        _kind: kind,
        _min_plan: MIN_PLAN[kind],
        _from_model: rec.fromModel,
        _from_host: rec.fromHost,
        _to_model: rec.toModel,
        _to_host: rec.toHost,
        _task_hint: rec.taskHint,
        _monthly_saving: Math.round(rec.monthlySavingUsd * 100) / 100,
        _saving_pct: Math.round(rec.savingPct * 100) / 100,
        _basis: rec.basis,
        _note: rec.note,
        _quality_delta: rec.qualityDelta,
      } as never);
      if (error) throw new Error(error.message);
      ctx.report.recommendationsWritten += 1;

      // Govern only. Autonomy is on when the workspace is genuinely on the
      // Govern level; every other gate lives in evaluateAutonomous.
      const verdict = evaluateAutonomous(
        rec,
        // Two facts, both required: the workspace is genuinely on Govern, and
        // a manager has deliberately switched autonomous mode on. The plan on
        // its own has never been consent to change routing unattended.
        { ...DEFAULT_AUTONOMOUS_POLICY, enabled: plan === "govern" && org.autonomous_enabled },
        {
          now: new Date(),
          lastAutonomousChangeAt:
            cooldowns.get(workloadKey(org.id, rec.fromModel, rec.fromHost)) ?? null,
          active: incumbents.get(workloadKey(org.id, rec.fromModel, rec.fromHost)) ?? null,
        },

      );
      if (!verdict.allowed) {
        ctx.report.autonomousRefusals[verdict.reason] =
          (ctx.report.autonomousRefusals[verdict.reason] ?? 0) + 1;
        continue;
      }

      const { error: applyError } = await supabaseAdmin.rpc("system_apply_switch", {
        _rec_id: recId as string,
      } as never);
      if (applyError) {
        // "already has an active switch" is a normal refusal, not a failure.
        ctx.report.autonomousRefusals["blocked"] =
          (ctx.report.autonomousRefusals["blocked"] ?? 0) + 1;
        continue;
      }
      ctx.report.autonomousSwitches += 1;
    }
  }

  /*
   * Anything still open that this cycle did not reaffirm is no longer supported
   * by current prices, benchmarks or traffic — a delisted destination, a
   * baseline that turned out to be unmeasured, a gap that closed. Reaffirmed
   * rows carry a fresh computed_at, so the leftovers are exactly the stale ones,
   * and they are retired rather than left standing as a live claim.
   */
  const retired = await supabaseAdmin
    .from("recommendations")
    .update({ status: "refused" })
    .eq("org_id", org.id)
    .eq("status", "open")
    .lt("computed_at", cycleStart);
  // Dispatch 91. A dropped retire leaves a claim the engine no longer stands
  // behind on a customer's screen, so it is never swallowed.
  if (retired.error) throw new Error(`retiring stale recommendations failed: ${retired.error.message}`);
}

/**
 * The last unattended change per workload.
 *
 * Dispatch 187. `activated_autonomous` events carry a switch id; the switch
 * carries the workload identity. Reading it this way means one churning
 * workload serves its own 72h and every other workload in the workspace stays
 * free to act.
 */
async function lastAutonomousChangeByWorkload(orgId: string): Promise<Map<string, Date>> {
  const { data } = await supabaseAdmin
    .from("switch_events")
    .select("created_at, switches!inner(from_model, from_host)")
    .eq("org_id", orgId)
    .eq("event", "activated_autonomous")
    .order("created_at", { ascending: false });

  const out = new Map<string, Date>();
  for (const row of (data ?? []) as Array<{
    created_at: string;
    switches: { from_model: string; from_host: string } | null;
  }>) {
    const s = row.switches;
    if (!s || !row.created_at) continue;
    const key = workloadKey(orgId, s.from_model, s.from_host);
    // Rows arrive newest first, so the first sighting of a workload is its last change.
    if (!out.has(key)) out.set(key, new Date(row.created_at));
  }
  return out;
}

/** What each workload is already switched to, and what that switch is really saving. */
async function activeDestinations(orgId: string): Promise<Map<string, ActiveDestination>> {
  const { data } = await supabaseAdmin
    .from("switches")
    .select("from_model, from_host, to_model, to_host, saved_usd, activated_at")
    .eq("org_id", orgId)
    .eq("status", "active");

  const out = new Map<string, ActiveDestination>();
  for (const s of data ?? []) {
    const activeDays = Math.max(
      1,
      Math.floor((Date.now() - new Date(s.activated_at as string).getTime()) / DAY_MS),
    );
    out.set(workloadKey(orgId, s.from_model as string, s.from_host as string), {
      toModel: s.to_model as string,
      toHost: s.to_host as string,
      // Measured dollars, annualised to a monthly rate the same way every
      // other surface does it — never a projection of what it might save.
      monthlySavingUsd: Math.round((Number(s.saved_usd) / activeDays) * 30 * 100) / 100,
    });
  }
  return out;
}


/**
 * The outcome of one scheduled run, as the ledger records it.
 *
 * Before Dispatch 65 the ledger held a single boolean, and that boolean only
 * ever meant "the handler did not throw". A collector that answered 200 and
 * wrote nothing was indistinguishable from one that wrote a full day of data —
 * which is exactly how 1 August 2026 passed as healthy. The outcome below
 * separates the three states that actually matter:
 *
 *   ok     — the run completed and wrote rows.
 *   empty  — the run completed, data was expected, and nothing was written.
 *   quiet  — the run completed and there was genuinely nothing to write.
 *   failed — the run errored.
 *
 * `quiet` is the only zero-row state that counts as observed. It requires the
 * collector to say so explicitly; a collector that cannot tell the difference
 * must report `empty`, never `quiet`.
 */
export type RunOutcome = "ok" | "empty" | "quiet" | "failed";

export interface RunRecord {
  job: string;
  started: Date;
  outcome: RunOutcome;
  /** Rows this run actually wrote. Required — "unknown" is not an answer. */
  rowsWritten: number;
  detail?: unknown;
  error?: string;
}

/** Records one scheduled run so a silently dead — or silently empty — schedule is visible, not guessed at. */
export async function recordRun(record: RunRecord): Promise<void> {
  const { error } = await supabaseAdmin.from("sync_runs").insert({
    job: record.job,
    started_at: record.started.toISOString(),
    finished_at: new Date().toISOString(),
    // `ok` is kept for the existing dashboards, but it is no longer the
    // health signal: it now means "did not error", which is all it ever meant.
    ok: record.outcome !== "failed",
    outcome: record.outcome,
    rows_written: record.rowsWritten,
    detail: (record.detail ?? null) as never,
    error: record.error ?? null,
  } as never);
  // Dispatch 91. This ledger is what the whole standing audit reads. A run
  // that fails to record itself is indistinguishable from a schedule that
  // never fired, which is exactly the 1 August failure one layer up — so the
  // ledger write is the last thing allowed to fail quietly.
  if (error) throw new Error(`recording ${record.job} run failed: ${error.message}`);
}

/** Classify a completed collector run from what it produced against what it expected. */
export function classifyRun(rowsWritten: number, rowsExpected: boolean): RunOutcome {
  if (rowsWritten > 0) return "ok";
  return rowsExpected ? "empty" : "quiet";
}

