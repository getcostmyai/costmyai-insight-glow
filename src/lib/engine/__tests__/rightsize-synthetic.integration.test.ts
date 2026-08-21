/**
 * Rightsize, run against generated synthetic traffic — in an isolated workspace.
 *
 * The gap this closes: Rightsize's synthetic evidence lived at the generator
 * layer (`synthetic.test.ts` asserting which shapes ought to be flagged), never
 * from a real run of the writer over seeded rows. Govern's harness proved the
 * shared detection pipeline end to end; what Rightsize adds beyond that is its
 * own tier logic (`MIN_RIGHTSIZE_SAMPLE`, `requiredTierFor`, the $1 floor and
 * the `cheaperWins` target choice) and the manual, human-driven switch path on
 * a workspace with autonomy switched OFF.
 *
 * So: a disposable workspace created through `create_organization` under
 * `guardIntegrationDatabase`, a real paid Rightsize relationship (org row plus
 * a live subscriptions row in the right environment — not an admin plan poke),
 * `autonomous_enabled = false`, and three deliberately shaped workloads:
 *
 *   • OVERSIZED — frontier model, hundreds of requests a day, short and almost
 *     uniform replies; `requiredTierFor` lands on economy, and a real economy
 *     price beats the arbitrage baseline. Must be flagged.
 *   • THIN — the identical shape, but under `MIN_RIGHTSIZE_SAMPLE` requests.
 *     Must NOT be flagged: the dispersion of a thin sample means nothing.
 *   • FRONTIER — long, highly variable replies on a frontier model. Correctly
 *     sized. Must NOT be flagged.
 *
 * The saving asserted on the written row is not a hand-checked number: the test
 * re-reads the seeded rollups the way `evaluateOrg` aggregates them and re-runs
 * `findOversized` over the live catalogue, then requires the database row to
 * equal that.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { requirePlan, resolvePlan } from "@/lib/billing/guard.server";
import { findOversized, MIN_RIGHTSIZE_SAMPLE, requiredTierFor } from "@/lib/engine/rightsize";
import type { ModelRow, PriceRow, UsageAggregate } from "@/lib/engine/types";
import { DAY_MS, generateEvents, rollupEvents, type SyntheticEvent } from "@/lib/synthetic/generator";
import { sizeWorkloads } from "@/lib/synthetic/sizing";
import type { SyntheticWorkload } from "@/lib/synthetic/workloads";

import { guardIntegrationDatabase } from "../../__tests__/support/isolation";

const URL = process.env["SUPABASE_URL"]!;
const SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
const PUBLISHABLE = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
const ENV = "sandbox" as const;
const DEMO_ORG = "00000000-0000-0000-0000-000000000001";

/** Same convention as `costmyai-demo-v1` / `costmyai-govern-v1`. */
const SEED = "costmyai-rightsize-v1";
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
const PASSWORD = "Test-Rightsize-Synth-2026!";

/** Frontier weights doing clerical work: the whole Rightsize thesis. */
const OVERSIZED: SyntheticWorkload = {
  modelKey: "anthropic/claude-opus-4.5",
  host: "anthropic",
  taskHint: "classification",
  spendShare: 1,
  inputP50: 900,
  inputSpread: 1.4,
  outputP50: 70,
  outputP95: 100,
  latencyP50Ms: 1900,
  errorRate: 0.004,
  label: "Ticket triage on a frontier model (oversized)",
};

/** The same shape, seen too few times for the shape to mean anything. */
const THIN: SyntheticWorkload = {
  modelKey: "openai/gpt-5.5-pro",
  host: "openrouter",
  taskHint: "classification",
  spendShare: 1,
  inputP50: 900,
  inputSpread: 1.4,
  outputP50: 70,
  outputP95: 100,
  latencyP50Ms: 5200,
  errorRate: 0.004,
  label: "Rarely-run labelling job (below the sample floor)",
};

/** Long, highly variable generation. Correctly on a frontier model. */
const FRONTIER: SyntheticWorkload = {
  modelKey: "anthropic/claude-opus-4.5",
  host: "anthropic",
  taskHint: "generation",
  spendShare: 1,
  inputP50: 9000,
  inputSpread: 2.2,
  outputP50: 1800,
  outputP95: 4400,
  latencyP50Ms: 12400,
  errorRate: 0.005,
  label: "Long-document drafting (correctly sized)",
};

const OVERSIZED_MONTHLY_USD = 3_000;
const FRONTIER_MONTHLY_USD = 6_000;
/** Small enough that the generator emits a handful of calls a day, not hundreds. */
const THIN_MONTHLY_USD = 4;

interface Actor {
  id: string;
  client: SupabaseClient;
}

async function makeActor(who: string): Promise<Actor> {
  const email = `rightsize-synth-${who}-${stamp}@costmyai-test.dev`;
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
      stripe_subscription_id: `sub_test_rs_${orgId}`,
      stripe_customer_id: `cus_test_rs_${orgId}`,
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

async function livePrices(): Promise<PriceRow[]> {
  const rows: any[] = [];
  for (let page = 0; page < 40; page++) {
    const { data, error } = await admin
      .from("host_prices")
      .select(
        "model_key, host, host_label, input_usd_per_mtok, output_usd_per_mtok, cache_read_usd_per_mtok, cache_write_usd_per_mtok, supports_prompt_caching",
      )
      .eq("is_active", true)
      .range(page * 1000, page * 1000 + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
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
  const rows: any[] = [];
  for (let page = 0; page < 40; page++) {
    const { data, error } = await admin
      .from("model_catalog")
      .select("model_key, display_name, vendor, tier")
      .eq("is_active", true)
      .range(page * 1000, page * 1000 + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return rows as ModelRow[];
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

let owner: Actor;
let orgId: string;
let freeOrgId: string;
let seededSpendUsd = 0;
let usage: UsageAggregate[] = [];
let expectedMonthlySaving = 0;
let expectedTarget = { model: "", host: "" };
let firstRun: Awaited<ReturnType<typeof import("../evaluate.server").runEvaluation>>;

beforeAll(async () => {
  owner = await makeActor("owner");

  const created = await owner.client.rpc("create_organization", {
    _name: `Rightsize Synthetic ${stamp}`,
  });
  if (created.error) throw created.error;
  orgId = created.data as string;
  expect(orgId).not.toBe(DEMO_ORG);

  const free = await owner.client.rpc("create_organization", {
    _name: `Rightsize Compare ${stamp}`,
  });
  if (free.error) throw free.error;
  freeOrgId = free.data as string;

  await grantPaidPlan(orgId, "rightsize");

  // Autonomy stays off. Rightsize is a human-driven level.
  const org = await admin
    .from("organizations")
    .select("plan, autonomous_enabled")
    .eq("id", orgId)
    .single();
  expect(org.data).toMatchObject({ plan: "rightsize", autonomous_enabled: false });

  // ---- seed, through the very same generator the demo ecosystem uses ----
  const priceRows = await livePrices();
  const priceIndex = new Map(priceRows.map((p) => [`${p.model_key}|${p.host}`, p]));
  const priceFor = (m: string, h: string) => priceIndex.get(`${m}|${h}`);

  const to = new Date();
  to.setUTCMinutes(0, 0, 0);
  const from = new Date(to.getTime() - WINDOW_DAYS * DAY_MS);

  const sized = [
    ...sizeWorkloads([OVERSIZED], priceFor, { targetMonthlyUsd: OVERSIZED_MONTHLY_USD }),
    ...sizeWorkloads([FRONTIER], priceFor, { targetMonthlyUsd: FRONTIER_MONTHLY_USD }),
    ...sizeWorkloads([THIN], priceFor, { targetMonthlyUsd: THIN_MONTHLY_USD }),
  ];

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
  // below has to read exactly the same buckets or the two savings differ by
  // whichever day falls outside the boundary.
  const sinceIso = new Date(Date.now() - EVALUATION_WINDOW_DAYS * DAY_MS).toISOString();
  firstRun = await runEvaluation(`rightsize-synthetic-test-${stamp}`, { orgIds: [orgId] });

  // The engine's own answer, recomputed from what was actually written.
  const stored = (
    await allRows<any>(
      "usage_rollups",
      "bucket_start, model_key, host, task_hint, requests, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, output_p50, output_p95",
      orgId,
    )
  ).filter((r) => new Date(r.bucket_start).getTime() >= Date.parse(sinceIso));
  usage = aggregate(stored);
  const models = await liveModels();
  const oversized = findOversized(usage, models, priceRows);
  const mine = oversized.find(
    (r) => r.fromModel === OVERSIZED.modelKey && r.taskHint === OVERSIZED.taskHint,
  );
  if (!mine) throw new Error("generator produced no oversized workload — seed needs revisiting");
  expectedMonthlySaving = mine.monthlySavingUsd;
  expectedTarget = { model: mine.toModel!, host: mine.toHost! };
  // The two negative cases must be absent from the engine's own answer too.
  expect(oversized.map((r) => `${r.fromModel}|${r.taskHint}`)).toEqual([
    `${OVERSIZED.modelKey}|${OVERSIZED.taskHint}`,
  ]);
}, 300_000);

afterAll(async () => {
  for (const id of [orgId, freeOrgId]) if (id) await admin.from("organizations").delete().eq("id", id);
  if (owner?.id) await admin.auth.admin.deleteUser(owner.id);
}, 60_000);

describe("Rightsize against generated synthetic traffic", () => {
  it("seeds a realistic 30-day window with all three shapes, in an isolated workspace", () => {
    const spend = Math.round(usage.reduce((s, u) => s + u.cost_usd, 0) * 100) / 100;
    // The engine's 30-day window can clip the oldest generated bucket, so this
    // is the seeded total less at most one day, never more.
    expect(spend).toBeLessThanOrEqual(seededSpendUsd + 0.01);
    expect(spend).toBeGreaterThan(seededSpendUsd * 0.9);
    const find = (w: SyntheticWorkload) =>
      usage.find((u) => u.model_key === w.modelKey && u.host === w.host && u.task_hint === w.taskHint)!;

    const big = find(OVERSIZED);
    const thin = find(THIN);
    const frontier = find(FRONTIER);
    console.log(
      `[seed] spend=$${spend} oversized=${big.requests}req/${requiredTierFor(big)} ` +
        `thin=${thin.requests}req/${requiredTierFor(thin)} frontier=${frontier.requests}req/${requiredTierFor(frontier)}`,
    );

    expect(big.requests).toBeGreaterThanOrEqual(MIN_RIGHTSIZE_SAMPLE);
    expect(requiredTierFor(big)).toBe("economy");

    expect(thin.requests).toBeLessThan(MIN_RIGHTSIZE_SAMPLE);
    // The shape alone WOULD qualify — only the sample size saves it from a claim.
    expect(requiredTierFor(thin)).toBe("economy");

    expect(requiredTierFor(frontier)).toBe("frontier");
  });

  it("writes exactly one rightsize recommendation, for the oversized workload only", async () => {
    expect(firstRun.orgs).toBe(1);
    expect(firstRun.errors).toEqual([]);

    const recs = await allRows<any>(
      "recommendations",
      "kind, min_plan, from_model, from_host, to_model, to_host, task_hint, monthly_saving_usd, status",
      orgId,
    );
    const rightsize = recs.filter((r) => r.kind === "rightsize");
    console.log(
      `[rightsize] rows=${rightsize.length} -> ${rightsize
        .map(
          (r) =>
            `${r.from_model}@${r.from_host}/${r.task_hint} -> ${r.to_model}@${r.to_host} $${r.monthly_saving_usd}/mo (${r.min_plan}, ${r.status})`,
        )
        .join(" | ")}`,
    );

    expect(rightsize).toHaveLength(1);
    const row = rightsize[0]!;
    expect(row.min_plan).toBe("rightsize");
    expect(row.from_model).toBe(OVERSIZED.modelKey);
    expect(row.from_host).toBe(OVERSIZED.host);
    expect(row.task_hint).toBe(OVERSIZED.taskHint);
    expect(row.to_model).toBe(expectedTarget.model);
    expect(row.to_host).toBe(expectedTarget.host);
    expect(row.status).toBe("open");

    // Not a hand-checked figure: the engine's own recomputed value.
    expect(Number(row.monthly_saving_usd)).toBeCloseTo(expectedMonthlySaving, 2);
    console.log(
      `[saving] engine=$${expectedMonthlySaving}/mo written=$${row.monthly_saving_usd}/mo target=${expectedTarget.model}@${expectedTarget.host}`,
    );

    // The two negative cases produced no rightsize row of any kind.
    for (const w of [THIN, FRONTIER]) {
      expect(
        rightsize.filter((r) => r.from_model === w.modelKey && r.task_hint === w.taskHint),
      ).toHaveLength(0);
    }
  }, 60_000);

  it("auto-applies nothing: Rightsize never self-activates", async () => {
    expect(firstRun.autonomousSwitches).toBe(0);
    const switches = await allRows<any>("switches", "id, autonomous, status", orgId);
    expect(switches).toHaveLength(0);
    const org = await admin
      .from("organizations")
      .select("autonomous_enabled")
      .eq("id", orgId)
      .single();
    expect(org.data?.autonomous_enabled).toBe(false);
  }, 60_000);
});

describe("the manual switch path, through an authenticated RLS-scoped client", () => {
  let recId = "";
  let switchId = "";

  it("is entitled: the paid Rightsize workspace clears requirePlan", async () => {
    expect(await resolvePlan(owner.client, orgId, ENV)).toBe("rightsize");
    await expect(requirePlan(owner.client, orgId, "rightsize", ENV)).resolves.toBe("rightsize");
    // And nothing above it.
    await expect(requirePlan(owner.client, orgId, "govern", ENV)).rejects.toThrow(/govern/i);
  }, 30_000);

  it("activates the rightsize recommendation as the manager, not as admin", async () => {
    const rec = await owner.client
      .from("recommendations")
      .select("id")
      .eq("org_id", orgId)
      .eq("kind", "rightsize")
      .eq("status", "open")
      .single();
    expect(rec.error).toBeNull();
    recId = rec.data!.id as string;

    const applied = await owner.client.rpc("apply_switch", { _rec_id: recId, _autonomous: false });
    expect(applied.error).toBeNull();
    switchId = applied.data as string;

    const row = await admin
      .from("switches")
      .select("status, autonomous, activated_by, to_model, to_host")
      .eq("id", switchId)
      .single();
    console.log(`[manual] activate -> ${JSON.stringify(row.data)}`);
    expect(row.data).toMatchObject({
      status: "active",
      autonomous: false,
      activated_by: owner.id,
      to_model: expectedTarget.model,
      to_host: expectedTarget.host,
    });
  }, 60_000);

  it("pauses, resumes, then rolls back — each state read back from the row", async () => {
    const paused = await owner.client.rpc("set_switch_state", {
      _switch_id: switchId,
      _status: "paused",
      _reason: "watching quality",
    });
    expect(paused.error).toBeNull();
    let row = await admin.from("switches").select("status").eq("id", switchId).single();
    expect(row.data?.status).toBe("paused");
    console.log("[manual] pause -> paused");

    const resumed = await owner.client.rpc("set_switch_state", {
      _switch_id: switchId,
      _status: "active",
    });
    expect(resumed.error).toBeNull();
    row = await admin.from("switches").select("status").eq("id", switchId).single();
    expect(row.data?.status).toBe("active");
    console.log("[manual] resume -> active");

    const rolled = await owner.client.rpc("set_switch_state", {
      _switch_id: switchId,
      _status: "rolled_back",
      _reason: "back to the original model",
    });
    expect(rolled.error).toBeNull();
    row = await admin.from("switches").select("status").eq("id", switchId).single();
    expect(row.data?.status).toBe("rolled_back");
    console.log("[manual] rollback -> rolled_back (final)");

    // Final for good, and the finding is offered again.
    const replay = await owner.client.rpc("set_switch_state", {
      _switch_id: switchId,
      _status: "active",
    });
    expect(replay.error?.message ?? "").toMatch(/rolled back/i);
    const rec = await admin.from("recommendations").select("status").eq("id", recId).single();
    expect(rec.data?.status).toBe("open");

    const events = await admin
      .from("switch_events")
      .select("event")
      .eq("switch_id", switchId)
      .order("created_at");
    expect((events.data ?? []).map((e) => e.event)).toEqual([
      "activated",
      "paused",
      "resumed",
      "rolled_back",
    ]);
  }, 60_000);

  it("refuses the identical sequence on a Compare workspace — a real rejection", async () => {
    expect(await resolvePlan(owner.client, freeOrgId, ENV)).toBe("compare");
    await expect(requirePlan(owner.client, freeOrgId, "rightsize", ENV)).rejects.toThrow(
      /rightsize/i,
    );

    // And the database refuses the write underneath the guard, too.
    const direct = await owner.client.from("routing_rules").insert({
      org_id: freeOrgId,
      from_model: OVERSIZED.modelKey,
      from_host: OVERSIZED.host,
      to_model: expectedTarget.model,
      to_host: expectedTarget.host,
      source: "manual",
      state: "active",
      basis: "right-sized",
    });
    expect(direct.error).not.toBeNull();
    console.log(`[compare] requirePlan refused; direct write refused: ${direct.error?.message}`);
  }, 60_000);
});

describe("cleanup", () => {
  it("leaves no rows behind, proven by query", async () => {
    for (const id of [orgId, freeOrgId]) {
      await admin.from("organizations").delete().eq("id", id);
    }

    for (const table of [
      "usage_rollups",
      "recommendations",
      "switches",
      "switch_events",
      "subscriptions",
    ]) {
      for (const id of [orgId, freeOrgId]) {
        const { data, error } = await admin.from(table).select("id").eq("org_id", id);
        expect(error).toBeNull();
        expect({ table, rows: (data ?? []).length }).toEqual({ table, rows: 0 });
      }
    }
    const orgs = await admin.from("organizations").select("id").in("id", [orgId, freeOrgId]);
    expect(orgs.data ?? []).toHaveLength(0);

    await admin.auth.admin.deleteUser(owner.id);
    orgId = "";
    freeOrgId = "";
  }, 120_000);
});
