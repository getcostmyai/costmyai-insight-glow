/**
 * Certify, run against generated synthetic traffic — in an isolated workspace.
 *
 * What was already covered, and is deliberately NOT rebuilt here:
 *   • separation pins, the ladder's four-cell resolution logic, and the
 *     saturated-instrument cell live in `certification-golden.test.ts` and stay
 *     fixture-based on purpose — pinning them to live rows would make the file
 *     break on every AA sync, which is exactly the wrong failure.
 *
 * What was missing, and is what this file proves, on real seeded rows:
 *   • the refusal branches, observed the only way they can be. Refusals are
 *     never persisted — `runEvaluation` writes recommendations and discards
 *     `Refusal[]` and `stats`, which `dashboard.server` recomputes at read
 *     time. So the refusals below are read by running the real pipeline over
 *     the rollups the seeder actually wrote, against the live price, benchmark
 *     and margin tables. No JSON fixture is involved anywhere in this file.
 *   • the accept cell's persisted shape: `min_plan`, and the absence of a
 *     competing arbitrage or rightsize row on the same workload. Govern's
 *     harness asserted the row's kind and delta but neither of those.
 *   • the arithmetic the Certify hero prints — the certifiable denominator,
 *     the certification rate, and the three refusal buckets summing to the
 *     total — as exact numbers for this seeded org, not as field existence.
 *
 * The four seeded workloads, each chosen so exactly one branch can fire:
 *   • ACCEPT       openai/gpt-5.1 @ openai, generation. Cheapest host for that
 *                  model (so arbitrage finds nothing) and long, moderately
 *                  variable replies on a standard-tier model (so rightsize
 *                  finds nothing). Must certify.
 *   • UNLABELLED   task_hint "unknown" — no instrument exists for traffic
 *                  nothing read. Must refuse `no_valid_instrument`.
 *   • UNCOVERED    openai/o1-pro, absent from the benchmark feed entirely.
 *                  Must refuse `no_baseline_score`, "not covered by" wording.
 *   • ELSEWHERE    openai/gpt-4, measured on another instrument but not on the
 *                  one `classification` resolves to. Must refuse
 *                  `no_baseline_score`, "but not on" wording. Both wordings of
 *                  the same reason, on the same run.
 *
 * The two post-measurement refusals need a restricted candidate set — that is
 * what makes them reachable — so they re-run the real engine over the ACCEPT
 * workload's real seeded rollups with the live price table filtered to a
 * subset. Real usage, real prices, real scores; only the candidate field is
 * narrowed, the same technique the golden file uses.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { certificationRate } from "@/lib/dashboard/figures";
import { breakdownRefusals } from "@/lib/engine/refusal-class";
import type {
  BenchmarkRow,
  MarginRow,
  ModelRow,
  PriceRow,
  Refusal,
  UsageAggregate,
} from "@/lib/engine/types";
import { runPipeline, type EngineOutput } from "@/lib/engine/pipeline";
import { BENCHMARK_FEED, benchmarksAreCertifiable } from "@/lib/sync-freshness";
import { DAY_MS, generateEvents, rollupEvents, type SyntheticEvent } from "@/lib/synthetic/generator";
import { sizeWorkloads } from "@/lib/synthetic/sizing";
import type { SyntheticWorkload } from "@/lib/synthetic/workloads";

import { guardIntegrationDatabase } from "../../__tests__/support/isolation";

const URL = process.env["SUPABASE_URL"]!;
const SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
const PUBLISHABLE = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
const ENV = "sandbox" as const;
const DEMO_ORG = "00000000-0000-0000-0000-000000000001";

/** Same convention as `costmyai-govern-v1` / `costmyai-rightsize-v1`. */
const SEED = "costmyai-certify-v1";
const WINDOW_DAYS = 30;
const EVALUATION_WINDOW_DAYS = 30;

function keyFetch(key: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));
    if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
}

const admin = createClient(URL, SERVICE, {
  global: { fetch: keyFetch(SERVICE) },
  auth: { persistSession: false, autoRefreshToken: false },
});

guardIntegrationDatabase(admin);

const stamp = Date.now();
const PASSWORD = "Test-Certify-Synth-2026!";

/** Certifiable: scored on LCR, on its own cheapest host, correctly sized. */
const ACCEPT: SyntheticWorkload = {
  modelKey: "openai/gpt-5.1",
  host: "openai",
  taskHint: "generation",
  spendShare: 1,
  inputP50: 3400,
  inputSpread: 1.6,
  outputP50: 1600,
  outputP95: 2000,
  latencyP50Ms: 8200,
  errorRate: 0.004,
  label: "Long-form drafting on a scored standard model (certifiable)",
};

/** Traffic nothing read. There is no instrument for an unnamed kind of work. */
const UNLABELLED: SyntheticWorkload = {
  modelKey: "anthropic/claude-opus-4.5",
  host: "anthropic",
  taskHint: "unknown",
  spendShare: 1,
  inputP50: 2600,
  inputSpread: 1.7,
  outputP50: 700,
  outputP95: 1100,
  latencyP50Ms: 6100,
  errorRate: 0.004,
  label: "Unlabelled gateway traffic (v1 connector shape)",
};

/** Priced, but absent from the independent feed on every instrument. */
const UNCOVERED: SyntheticWorkload = {
  modelKey: "openai/o1-pro",
  host: "openai",
  taskHint: "classification",
  spendShare: 1,
  inputP50: 1100,
  inputSpread: 1.3,
  outputP50: 260,
  outputP95: 380,
  latencyP50Ms: 9400,
  errorRate: 0.004,
  label: "Legacy reasoning model with no benchmark coverage",
};

/** Measured — but not on the instrument this task has to be judged on. */
const ELSEWHERE: SyntheticWorkload = {
  modelKey: "openai/gpt-4",
  host: "openai",
  taskHint: "classification",
  spendShare: 1,
  inputP50: 1200,
  inputSpread: 1.3,
  outputP50: 240,
  outputP95: 340,
  latencyP50Ms: 4300,
  errorRate: 0.004,
  label: "Model scored elsewhere, unscored on the resolved instrument",
};

const TARGET_MONTHLY_USD: Record<string, number> = {
  [`${ACCEPT.modelKey}|${ACCEPT.taskHint}`]: 5_000,
  [`${UNLABELLED.modelKey}|${UNLABELLED.taskHint}`]: 2_000,
  [`${UNCOVERED.modelKey}|${UNCOVERED.taskHint}`]: 1_500,
  [`${ELSEWHERE.modelKey}|${ELSEWHERE.taskHint}`]: 900,
};

/** Priced above gpt-5.1's cheapest host, and clears the LCR bar. */
const PRICIER_EQUAL = "anthropic/claude-opus-4.5";
/** Cheap, and scores far below the bar. */
const CHEAP_BELOW_BAR = "openai/gpt-oss-120b";

interface Actor {
  id: string;
  client: SupabaseClient;
}

async function makeActor(who: string): Promise<Actor> {
  const email = `certify-synth-${who}-${stamp}@costmyai-test.dev`;
  const created = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  const client = createClient(URL, PUBLISHABLE, {
    global: { fetch: keyFetch(PUBLISHABLE) },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signedIn = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signedIn.error) throw signedIn.error;
  return { id: created.data.user!.id, client };
}

/** Exactly what a paid checkout leaves behind: a plan column and a live sub. */
async function grantPaidPlan(orgId: string, plan: "certify" | "rightsize" | "govern") {
  const org = await admin
    .from("organizations")
    .update({ plan })
    .eq("id", orgId)
    .select("plan")
    .maybeSingle();
  if (org.error) throw org.error;
  const { error } = await admin.from("subscriptions").upsert(
    {
      org_id: orgId,
      stripe_subscription_id: `sub_test_ct_${orgId}`,
      stripe_customer_id: `cus_test_ct_${orgId}`,
      price_id: `price_${plan}_monthly`,
      plan,
      status: "active",
      current_period_end: new Date(Date.now() + 30 * DAY_MS).toISOString(),
      environment: ENV,
    },
    { onConflict: "stripe_subscription_id" },
  );
  if (error) throw error;
}

async function allRows<T>(table: string, columns: string, orgId: string): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < 40; page++) {
    const { data, error } = await admin
      .from(table)
      .select(columns)
      .eq("org_id", orgId)
      .range(page * 1000, page * 1000 + 999);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

async function paged(table: string, columns: string, active: boolean): Promise<any[]> {
  const rows: any[] = [];
  for (let page = 0; page < 40; page++) {
    let q = admin.from(table).select(columns);
    if (active) q = q.eq("is_active", true);
    const { data, error } = await q.range(page * 1000, page * 1000 + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return rows;
}

async function livePrices(): Promise<PriceRow[]> {
  const rows = await paged(
    "host_prices",
    "model_key, host, host_label, input_usd_per_mtok, output_usd_per_mtok, cache_read_usd_per_mtok, cache_write_usd_per_mtok, supports_prompt_caching, median_latency_ms, median_ttft_ms, output_tps, latency_scope",
    true,
  );
  return rows.map((p) => ({
    ...p,
    input_usd_per_mtok: Number(p.input_usd_per_mtok),
    output_usd_per_mtok: Number(p.output_usd_per_mtok),
    cache_read_usd_per_mtok:
      p.cache_read_usd_per_mtok == null ? null : Number(p.cache_read_usd_per_mtok),
    cache_write_usd_per_mtok:
      p.cache_write_usd_per_mtok == null ? null : Number(p.cache_write_usd_per_mtok),
  })) as PriceRow[];
}

async function liveModels(): Promise<ModelRow[]> {
  return (await paged("model_catalog", "model_key, display_name, vendor, tier", true)) as ModelRow[];
}

async function liveBenchmarks(): Promise<BenchmarkRow[]> {
  const rows: any[] = [];
  for (let page = 0; page < 40; page++) {
    const { data, error } = await admin
      .from("benchmarks")
      .select("model_key, suite, task_class, score")
      .eq("is_fixture", false)
      .range(page * 1000, page * 1000 + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return rows.map((b) => ({ ...b, score: Number(b.score) })) as BenchmarkRow[];
}

async function liveMargins(): Promise<MarginRow[]> {
  const { data, error } = await admin
    .from("benchmark_margins")
    .select("suite, task_class, margin")
    .eq("is_fixture", false);
  if (error) throw error;
  return (data ?? []).map((m: any) => ({ ...m, margin: Number(m.margin) })) as MarginRow[];
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
}

/** The same aggregation `evaluateOrg` performs, so the engine sees the same input. */
function aggregate(rollups: any[]): UsageAggregate[] {
  const shapes = new Map<string, { p50: number[]; p95: number[] }>();
  const byWorkload = new Map<string, UsageAggregate>();
  for (const r of rollups) {
    const key = `${r.model_key}|${r.host}|${r.task_hint}`;
    const agg =
      byWorkload.get(key) ??
      ({
        model_key: r.model_key,
        host: r.host,
        task_hint: r.task_hint,
        requests: 0,
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        cost_usd: 0,
        days: EVALUATION_WINDOW_DAYS,
      } as UsageAggregate);
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
  return [...byWorkload.entries()].map(([key, u]) => ({
    ...u,
    output_p50: median(shapes.get(key)?.p50 ?? []),
    output_p95: median(shapes.get(key)?.p95 ?? []),
  }));
}

const WORKLOADS = [ACCEPT, UNLABELLED, UNCOVERED, ELSEWHERE];

let owner: Actor;
let orgId = "";
let usage: UsageAggregate[] = [];
let prices: PriceRow[] = [];
let models: ModelRow[] = [];
let benchmarks: BenchmarkRow[] = [];
let margins: MarginRow[] = [];
let engine: EngineOutput;
let seededSpendUsd = 0;
let firstRun: Awaited<ReturnType<typeof import("../evaluate.server").runEvaluation>>;

const refusalFor = (w: SyntheticWorkload): Refusal | undefined =>
  engine.refusals.find(
    (r) => r.fromModel === w.modelKey && r.fromHost === w.host && r.taskHint === w.taskHint,
  );

beforeAll(async () => {
  owner = await makeActor("owner");

  const created = await owner.client.rpc("create_organization", {
    _name: `Certify Synthetic ${stamp}`,
  });
  if (created.error) throw created.error;
  orgId = created.data as string;
  expect(orgId).not.toBe(DEMO_ORG);

  await grantPaidPlan(orgId, "certify");
  const org = await admin
    .from("organizations")
    .select("plan, autonomous_enabled")
    .eq("id", orgId)
    .single();
  expect(org.data).toMatchObject({ plan: "certify", autonomous_enabled: false });

  // ---- seed, through the very same generator the demo ecosystem uses ----
  prices = await livePrices();
  const priceIndex = new Map(prices.map((p) => [`${p.model_key}|${p.host}`, p]));
  const priceFor = (m: string, h: string) => priceIndex.get(`${m}|${h}`);

  const to = new Date();
  to.setUTCMinutes(0, 0, 0);
  const from = new Date(to.getTime() - WINDOW_DAYS * DAY_MS);

  const sized = WORKLOADS.flatMap((w) =>
    sizeWorkloads([w], priceFor, {
      targetMonthlyUsd: TARGET_MONTHLY_USD[`${w.modelKey}|${w.taskHint}`]!,
    }),
  );

  const events: SyntheticEvent[] = [];
  for (const workload of sized) {
    for (const e of generateEvents({
      workload,
      from,
      to,
      windowStart: from,
      windowEnd: to,
      seed: SEED,
    })) {
      events.push(e);
    }
  }
  const daily = rollupEvents(events, "day", priceFor);
  seededSpendUsd = Math.round(daily.reduce((s, r) => s + r.costUsd, 0) * 100) / 100;

  const rows = daily.map((r) => ({
    org_id: orgId,
    bucket_start: r.bucketStart.toISOString(),
    granularity: "day",
    model_key: r.modelKey,
    host: r.host,
    task_hint: r.taskHint,
    requests: r.requests,
    input_tokens: r.inputTokens,
    output_tokens: r.outputTokens,
    cost_usd: r.costUsd,
    output_p50: r.outputP50,
    output_p95: r.outputP95,
    peak_total_tokens: r.peakTotalTokens,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin.from("usage_rollups").insert(rows.slice(i, i + 500));
    if (error) throw error;
  }

  const { runEvaluation } = await import("../evaluate.server");
  // The writer reads a 30-day window from the moment it starts; the recompute
  // below has to read the same buckets or the two answers differ by whichever
  // day falls outside the boundary.
  const sinceIso = new Date(Date.now() - EVALUATION_WINDOW_DAYS * DAY_MS).toISOString();
  firstRun = await runEvaluation(`certify-synthetic-test-${stamp}`, { orgIds: [orgId] });

  const stored = (
    await allRows<any>(
      "usage_rollups",
      "bucket_start, model_key, host, task_hint, requests, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, output_p50, output_p95",
      orgId,
    )
  ).filter((r) => new Date(r.bucket_start).getTime() >= Date.parse(sinceIso));
  usage = aggregate(stored);

  models = await liveModels();
  benchmarks = await liveBenchmarks();
  margins = await liveMargins();

  // The evidence has to be datable, or certification refuses everything and
  // none of the branches below would be the branch under test.
  const snapshot = await admin
    .from("pricing_snapshots")
    .select("synced_at")
    .eq("feed", BENCHMARK_FEED)
    .eq("status", "ok")
    .order("synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  expect(benchmarksAreCertifiable(snapshot.data?.synced_at ?? null)).toBe(true);

  // The real pipeline, over the rows the seeder actually wrote. This is the
  // only way a refusal can be observed at all: nothing persists them.
  engine = runPipeline({ usage, prices, benchmarks, margins, models, staleEvidence: null });
}, 300_000);

afterAll(async () => {
  if (orgId) await admin.from("organizations").delete().eq("id", orgId);
  if (owner?.id) await admin.auth.admin.deleteUser(owner.id);
}, 60_000);

describe("the seeded window", () => {
  it("puts all four shapes in one isolated 30-day workspace", () => {
    const spend = Math.round(usage.reduce((s, u) => s + u.cost_usd, 0) * 100) / 100;
    expect(spend).toBeLessThanOrEqual(seededSpendUsd + 0.01);
    expect(spend).toBeGreaterThan(seededSpendUsd * 0.9);
    expect(usage).toHaveLength(WORKLOADS.length);
    console.log(
      `[seed] spend=$${spend} ` +
        usage
          .map((u) => `${u.model_key}@${u.host}/${u.task_hint}=${u.requests}req`)
          .join(" "),
    );
    expect(firstRun.orgs).toBe(1);
    expect(firstRun.errors).toEqual([]);
  });
});

describe("refusal branches, on real seeded traffic", () => {
  it("refuses unlabelled traffic with no_valid_instrument", () => {
    const r = refusalFor(UNLABELLED);
    console.log(`[no_valid_instrument] ${r?.reason} :: ${r?.detail.slice(0, 96)}...`);
    expect(r?.reason).toBe("no_valid_instrument");
    expect(r?.detail).toContain("without a task label");
    expect(r?.detail).toContain("no instrument to certify a quality-equivalent switch against");
    // And it was not quietly certified against a borrowed instrument.
    expect(
      engine.qualityMatched.some((q) => q.taskHint === UNLABELLED.taskHint),
    ).toBe(false);
  });

  it("refuses an uncovered model with the 'not covered by the feed' wording", () => {
    const r = refusalFor(UNCOVERED);
    console.log(`[no_baseline_score/uncovered] ${r?.reason} :: ${r?.detail}`);
    expect(r?.reason).toBe("no_baseline_score");
    expect(r?.detail).toContain(
      `${UNCOVERED.modelKey} is not covered by the independent benchmark feed yet`,
    );
    // The two wordings are mutually exclusive — this is the wrong one.
    expect(r?.detail).not.toContain("but not on");
  });

  it("refuses a model scored elsewhere with the 'but not on this instrument' wording", () => {
    const r = refusalFor(ELSEWHERE);
    console.log(`[no_baseline_score/elsewhere] ${r?.reason} :: ${r?.detail}`);
    expect(r?.reason).toBe("no_baseline_score");
    expect(r?.detail).toContain(
      `${ELSEWHERE.modelKey} is measured by the independent benchmark feed, but not on`,
    );
    expect(r?.detail).toContain("AA Long Context Reasoning");
    expect(r?.detail).not.toContain("not covered by");
  });

  it("refuses no_cheaper_candidate when the only equal-quality option costs more", () => {
    const mine = usage.find(
      (u) => u.model_key === ACCEPT.modelKey && u.task_hint === ACCEPT.taskHint,
    )!;
    const restricted = prices.filter(
      (p) =>
        (p.model_key === ACCEPT.modelKey && p.host === ACCEPT.host) ||
        p.model_key === PRICIER_EQUAL,
    );
    const out = runPipeline({
      usage: [mine],
      prices: restricted,
      benchmarks,
      margins,
      models,
      staleEvidence: null,
    });
    const r = out.refusals[0];
    console.log(`[no_cheaper_candidate] ${r?.reason} :: ${r?.detail}`);
    expect(out.qualityMatched).toHaveLength(0);
    expect(r?.reason).toBe("no_cheaper_candidate");
    expect(r?.detail).toContain("Quality-equal options exist but none price below");
  });

  it("refuses no_candidate_clears_bar when the only cheaper option scores below the band", () => {
    const mine = usage.find(
      (u) => u.model_key === ACCEPT.modelKey && u.task_hint === ACCEPT.taskHint,
    )!;
    const restricted = prices.filter(
      (p) =>
        (p.model_key === ACCEPT.modelKey && p.host === ACCEPT.host) ||
        p.model_key === CHEAP_BELOW_BAR,
    );
    const out = runPipeline({
      usage: [mine],
      prices: restricted,
      benchmarks,
      margins,
      models,
      staleEvidence: null,
    });
    const r = out.refusals[0];
    console.log(`[no_candidate_clears_bar] ${r?.reason} :: ${r?.detail}`);
    expect(out.qualityMatched).toHaveLength(0);
    expect(r?.reason).toBe("no_candidate_clears_bar");
    expect(r?.detail).toMatch(/^Nothing benchmarks at or above \d+\.\d\d on generation\.$/);
  });
});

describe("the accept cell, as it is actually persisted", () => {
  it("writes exactly one quality_match row for the certifiable workload, at min_plan certify", async () => {
    const recs = await allRows<any>(
      "recommendations",
      "kind, min_plan, from_model, from_host, to_model, to_host, task_hint, monthly_saving_usd, quality_delta, status",
      orgId,
    );
    const mine = recs.filter(
      (r) => r.from_model === ACCEPT.modelKey && r.task_hint === ACCEPT.taskHint,
    );
    console.log(
      `[accept] rows=${mine.length} -> ${mine
        .map(
          (r) =>
            `${r.kind}/${r.min_plan}: ${r.from_model}@${r.from_host} -> ${r.to_model}@${r.to_host} $${r.monthly_saving_usd}/mo delta=${r.quality_delta} (${r.status})`,
        )
        .join(" | ")}`,
    );

    // The gap Govern's harness left open, stated twice: the right plan gate,
    // and nothing else claiming the same workload.
    expect(mine).toHaveLength(1);
    const row = mine[0]!;
    expect(row.kind).toBe("quality_match");
    expect(row.min_plan).toBe("certify");
    expect(mine.filter((r) => r.kind === "host_arbitrage")).toHaveLength(0);
    expect(mine.filter((r) => r.kind === "rightsize")).toHaveLength(0);

    // A different model entirely — the equal-quality claim, not arbitrage.
    expect(row.to_model).not.toBe(ACCEPT.modelKey);
    expect(row.status).toBe("open");

    // The engine's own answer, recomputed from the rows that were written.
    const certified = engine.qualityMatched.find(
      (q) => q.fromModel === ACCEPT.modelKey && q.taskHint === ACCEPT.taskHint,
    );
    expect(certified).toBeDefined();
    expect(row.to_model).toBe(certified!.toModel);
    expect(row.to_host).toBe(certified!.toHost);
    expect(Number(row.monthly_saving_usd)).toBeCloseTo(certified!.monthlySavingUsd, 2);
  }, 60_000);

  it("auto-applies nothing: Certify has no execution layer of its own", async () => {
    expect(firstRun.autonomousSwitches).toBe(0);
    const switches = await allRows<any>("switches", "id, status", orgId);
    expect(switches).toHaveLength(0);
  }, 60_000);
});

describe("the arithmetic the Certify hero prints", () => {
  it("counts one certification, three refusals, all of them unmeasurable", () => {
    const s = engine.stats;
    console.log(
      `[stats] workloads=${s.workloads} evaluated=${s.qualityEvaluated} certified=${s.qualityCertified} ` +
        `refused=${s.qualityRefused} measured=${s.qualityRefusedMeasured} unmeasurable=${s.qualityRefusedUnmeasurable} ` +
        `noCandidate=${s.qualityRefusedNoCandidate} certifiable=${s.qualityCertifiable} rate=${certificationRate(s).toFixed(1)}%`,
    );

    expect(s.workloads).toBe(4);
    expect(s.qualityEvaluated).toBe(4);
    expect(s.qualityCertified).toBe(1);
    expect(s.qualityRefused).toBe(3);
    expect(s.qualityRefusedMeasured).toBe(0);
    expect(s.qualityRefusedUnmeasurable).toBe(3);
    expect(s.qualityRefusedNoCandidate).toBe(0);
  });

  it("sums the three buckets to the total, exactly", () => {
    const s = engine.stats;
    const b = breakdownRefusals(engine.refusals.map((r) => r.reason));
    expect(s.qualityRefusedMeasured + s.qualityRefusedUnmeasurable + s.qualityRefusedNoCandidate).toBe(
      s.qualityRefused,
    );
    expect({ ...b }).toEqual({ total: 3, measured: 0, unmeasurable: 3, noCandidate: 0 });
  });

  it("takes the certifiable denominator as measured workloads minus unmeasurable ones", () => {
    const s = engine.stats;
    expect(s.qualityCertifiable).toBe(s.workloads - s.qualityRefusedUnmeasurable);
    expect(s.qualityCertifiable).toBe(1);
  });

  it("never counts an unmeasurable workload as a failed certification", () => {
    const s = engine.stats;
    // One certifiable workload, and it certified. Anything that divided by all
    // four workloads would print 25% and call three absent tests failures.
    expect(certificationRate(s)).toBeCloseTo(100, 6);
    const naive = (s.qualityCertified / s.qualityEvaluated) * 100;
    expect(naive).toBeCloseTo(25, 6);
    expect(certificationRate(s)).not.toBeCloseTo(naive, 1);
  });
});

describe("cleanup", () => {
  it("leaves no rows behind, proven by query", async () => {
    await admin.from("organizations").delete().eq("id", orgId);

    for (const table of [
      "usage_rollups",
      "recommendations",
      "switches",
      "switch_events",
      "subscriptions",
    ]) {
      const { data, error } = await admin.from(table).select("id").eq("org_id", orgId);
      expect(error).toBeNull();
      expect({ table, rows: (data ?? []).length }).toEqual({ table, rows: 0 });
    }
    const orgs = await admin.from("organizations").select("id").eq("id", orgId);
    expect(orgs.data ?? []).toHaveLength(0);

    await admin.auth.admin.deleteUser(owner.id);
    orgId = "";
  }, 120_000);
});
