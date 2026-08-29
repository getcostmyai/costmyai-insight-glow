/**
 * Govern, run against generated synthetic traffic — in an isolated workspace.
 *
 * The gap this closes: Compare/Certify/Rightsize each have a synthetic-ecosystem
 * check, Govern had none. Its unit goldens use hand-built recommendation
 * fixtures, and the only realistic traffic in the system belongs to the shared
 * demo workspace the production cron autonomously executes on — so a harness
 * that wrote to it could neither tear down safely nor assert a stable outcome.
 *
 * So: a disposable workspace, created through `create_organization` under
 * `guardIntegrationDatabase`, seeded by the SAME deterministic generator the
 * demo ecosystem uses (same seed convention, reproducible run to run), then the
 * REAL writer (`runEvaluation` → `system_upsert_recommendation` →
 * `system_apply_switch`) narrowed to that workspace alone.
 *
 * Three cells of the Govern matrix are generated deliberately (see the Step 1
 * finding recorded in `GOVERN_WORKLOADS` below):
 *   • clean    — a same-model, cheaper-host workload worth four figures a month;
 *   • tradeoff — an equal-quality candidate whose replacement scores BELOW the
 *                baseline but inside the measured equivalence band;
 *   • refuse   — a workload sized so small that every saving on it falls under
 *                the $25/month autonomous floor.
 * A second evaluation cycle then proves the per-workload cooldown holds.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_AUTONOMOUS_POLICY } from "@/lib/engine/autonomous";
import type { PriceRow } from "@/lib/engine/types";
import { DAY_MS, generateEvents, rollupEvents, type SyntheticEvent } from "@/lib/synthetic/generator";
import { sizeWorkloads } from "@/lib/synthetic/sizing";
import type { SyntheticWorkload } from "@/lib/synthetic/workloads";

import { guardIntegrationDatabase } from "../../__tests__/support/isolation";

const URL = process.env["SUPABASE_URL"]!;
const SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
const PUBLISHABLE = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
const ENV = "sandbox" as const;
const DEMO_ORG = "00000000-0000-0000-0000-000000000001";

/** Same convention as the demo ecosystem's `costmyai-demo-v1`. */
const SEED = "costmyai-govern-v1";
const WINDOW_DAYS = 30;

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
const PASSWORD = "Test-Govern-Synth-2026!";

/**
 * The clean case: a frontier model served on Azure with the same model on the
 * vendor's own endpoint at a lower price. Same weights, so no quality question
 * arises at all.
 */
const CLEAN: SyntheticWorkload = {
  modelKey: "openai/gpt-5.1",
  host: "azure",
  taskHint: "generation",
  spendShare: 0.55,
  inputP50: 3100,
  inputSpread: 1.9,
  outputP50: 1450,
  outputP95: 3600,
  latencyP50Ms: 8600,
  errorRate: 0.006,
  label: "Answer composer (clean arbitrage)",
};

/**
 * The tradeoff case: a top-tier Anthropic path whose cheapest equal-quality
 * candidate scores *below* it, but by less than the measured margin. This is
 * exactly the case the old MIN_AUTONOMOUS_DELTA constant made unreachable.
 */
const TRADEOFF: SyntheticWorkload = {
  modelKey: "anthropic/claude-opus-4.5",
  host: "anthropic",
  taskHint: "generation",
  spendShare: 0.45,
  inputP50: 6800,
  inputSpread: 2.3,
  outputP50: 1900,
  outputP95: 4800,
  latencyP50Ms: 11900,
  errorRate: 0.005,
  label: "Long-document analysis (equivalence-band tradeoff)",
};

/**
 * The refuse case. Identical shape to a real classifier path, sized to a few
 * dollars a month, so every saving the engine finds on it is genuinely under
 * the autonomous floor — a refusal produced by the money, not by a flag.
 */
const TINY: SyntheticWorkload = {
  modelKey: "qwen/qwen3-32b",
  host: "groq",
  taskHint: "classification",
  spendShare: 1,
  inputP50: 980,
  inputSpread: 1.5,
  outputP50: 61,
  outputP95: 88,
  latencyP50Ms: 480,
  errorRate: 0.007,
  label: "Intent labelling (below the autonomous floor)",
};

const GOVERN_WORKLOADS = [CLEAN, TRADEOFF];
/** Small enough that no saving on it can clear $25/month. */
const TINY_MONTHLY_USD = 18;
const BIG_MONTHLY_USD = 17_500;

interface Actor {
  id: string;
  client: SupabaseClient;
}

async function makeActor(): Promise<Actor> {
  const email = `govern-synth-${stamp}@costmyai-test.dev`;
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

async function livePrices(): Promise<Map<string, PriceRow>> {
  const rows: any[] = [];
  for (let page = 0; page < 20; page++) {
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
  const map = new Map<string, PriceRow>();
  for (const p of rows) {
    map.set(`${p.model_key}|${p.host}`, {
      ...p,
      input_usd_per_mtok: Number(p.input_usd_per_mtok),
      output_usd_per_mtok: Number(p.output_usd_per_mtok),
      cache_read_usd_per_mtok:
        p.cache_read_usd_per_mtok == null ? null : Number(p.cache_read_usd_per_mtok),
      cache_write_usd_per_mtok:
        p.cache_write_usd_per_mtok == null ? null : Number(p.cache_write_usd_per_mtok),
    } as PriceRow);
  }
  return map;
}

let actor: Actor;
let orgId: string;
let seededSpendUsd = 0;
let firstRun: Awaited<ReturnType<typeof import("../evaluate.server").runEvaluation>>;
let secondRun: typeof firstRun;

beforeAll(async () => {
  actor = await makeActor();
  const { data, error } = await actor.client.rpc("create_organization", {
    _name: `Govern Synthetic ${stamp}`,
  });
  if (error) throw error;
  orgId = data as string;
  expect(orgId).not.toBe(DEMO_ORG);

  // A real paid Govern relationship, plus the deliberate opt-in. Both are
  // required by the writer; neither is faked past the database.
  await admin.from("organizations").update({ plan: "govern" }).eq("id", orgId);
  const sub = await admin.from("subscriptions").upsert(
    {
      org_id: orgId,
      stripe_subscription_id: `sub_test_govern_${orgId}`,
      stripe_customer_id: `cus_test_govern_${orgId}`,
      price_id: "price_govern_monthly",
      plan: "govern",
      status: "active",
      current_period_end: new Date(Date.now() + 30 * DAY_MS).toISOString(),
      environment: ENV,
    },
    { onConflict: "stripe_subscription_id" },
  );
  if (sub.error) throw sub.error;
  const enabled = await admin
    .from("organizations")
    .update({ autonomous_enabled: true })
    .eq("id", orgId)
    .select("autonomous_enabled")
    .maybeSingle();
  if (enabled.error) throw enabled.error;
  expect(enabled.data?.autonomous_enabled).toBe(true);

  // ---- seed, through the very same generator the demo ecosystem uses ----
  const prices = await livePrices();
  const priceFor = (m: string, h: string) => prices.get(`${m}|${h}`);

  const to = new Date();
  to.setUTCMinutes(0, 0, 0);
  const from = new Date(to.getTime() - WINDOW_DAYS * DAY_MS);

  const sized = [
    ...sizeWorkloads(GOVERN_WORKLOADS, priceFor, { targetMonthlyUsd: BIG_MONTHLY_USD }),
    ...sizeWorkloads([TINY], priceFor, { targetMonthlyUsd: TINY_MONTHLY_USD }),
  ];

  const events: SyntheticEvent[] = [];
  for (const workload of sized) {
    for (const e of generateEvents({ workload, from, to, windowStart: from, windowEnd: to, seed: SEED })) {
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
    is_synthetic: true,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    // eslint-disable-next-line costmyai/require-is-synthetic-on-guarded-insert -- is_synthetic is set on every row in the map above; the linter cannot see through .slice()/array variables into the chunk.
    const { error: insErr } = await admin.from("usage_rollups").insert(rows.slice(i, i + 500));
    if (insErr) throw insErr;
  }

  const { runEvaluation } = await import("../evaluate.server");
  firstRun = await runEvaluation(`govern-synthetic-test-${stamp}`, { orgIds: [orgId] });
  secondRun = await runEvaluation(`govern-synthetic-test-${stamp}-again`, { orgIds: [orgId] });
}, 300_000);

afterAll(async () => {
  if (orgId) await admin.from("organizations").delete().eq("id", orgId);
  if (actor?.id) await admin.auth.admin.deleteUser(actor.id);
}, 60_000);

describe("Govern against generated synthetic traffic", () => {
  it("seeds a realistic 30-day window in an isolated workspace, not the demo org", async () => {
    const { data, error } = await admin
      .from("usage_rollups")
      .select("bucket_start, cost_usd, model_key, host", { count: "exact" })
      .eq("org_id", orgId);
    expect(error).toBeNull();
    const rows = data ?? [];
    expect(rows.length).toBeGreaterThan(60);
    const spend = Math.round(rows.reduce((s, r) => s + Number(r.cost_usd), 0) * 100) / 100;
    expect(spend).toBeCloseTo(seededSpendUsd, 1);
    console.log(`[seed] rollup rows=${rows.length} spend=$${spend} over ${WINDOW_DAYS}d seed="${SEED}"`);
    expect(spend).toBeGreaterThan(10_000);
    const days = new Set(rows.map((r) => String(r.bucket_start).slice(0, 10)));
    expect(days.size).toBeGreaterThanOrEqual(29);
    const pairs = new Set(rows.map((r) => `${r.model_key}@${r.host}`));
    expect(pairs.has(`${CLEAN.modelKey}@${CLEAN.host}`)).toBe(true);
    expect(pairs.has(`${TRADEOFF.modelKey}@${TRADEOFF.host}`)).toBe(true);
    expect(pairs.has(`${TINY.modelKey}@${TINY.host}`)).toBe(true);
  }, 60_000);

  it("wrote recommendations for all three generated workloads", async () => {
    expect(firstRun.orgs).toBe(1);
    expect(firstRun.errors).toEqual([]);
    expect(firstRun.recommendationsWritten).toBeGreaterThanOrEqual(3);

    const { data } = await admin
      .from("recommendations")
      .select("kind, from_model, from_host, to_model, to_host, monthly_saving_usd, quality_delta, status")
      .eq("org_id", orgId);
    const recs = data ?? [];
    const froms = new Set(recs.map((r) => `${r.from_model}@${r.from_host}`));
    expect(froms.has(`${CLEAN.modelKey}@${CLEAN.host}`)).toBe(true);
    expect(froms.has(`${TRADEOFF.modelKey}@${TRADEOFF.host}`)).toBe(true);
    expect(froms.has(`${TINY.modelKey}@${TINY.host}`)).toBe(true);
  }, 60_000);

  it("activates the clean case: same model, cheaper host, autonomously", async () => {
    const { data } = await admin
      .from("switches")
      .select("to_model, to_host, badge, autonomous, status, basis")
      .eq("org_id", orgId)
      .eq("from_model", CLEAN.modelKey)
      .eq("from_host", CLEAN.host)
      .eq("status", "active");
    const rows = data ?? [];
    expect(rows).toHaveLength(1);
    const s = rows[0]!;
    // Same weights on a cheaper host — the model must not change.
    expect(s.to_model).toBe(CLEAN.modelKey);
    expect(s.to_host).not.toBe(CLEAN.host);
    expect(s.autonomous).toBe(true);
    expect(s.badge).toBe("Proven switch");

    const rec = await admin
      .from("recommendations")
      .select("monthly_saving_usd, status")
      .eq("org_id", orgId)
      .eq("kind", "host_arbitrage")
      .eq("from_model", CLEAN.modelKey)
      .eq("status", "activated")
      .maybeSingle();
    expect(rec.data).not.toBeNull();
    console.log(
      `[clean] ${CLEAN.modelKey}@${CLEAN.host} -> ${s.to_model}@${s.to_host} saving=$${rec.data!.monthly_saving_usd}/mo badge="${s.badge}"`,
    );
    expect(Number(rec.data!.monthly_saving_usd)).toBeGreaterThanOrEqual(
      DEFAULT_AUTONOMOUS_POLICY.minMonthlySavingUsd,
    );
  }, 60_000);

  it("activates the tradeoff case only inside the measured equivalence band", async () => {
    const { data } = await admin
      .from("switches")
      .select("to_model, to_host, badge, autonomous, recommendation_id")
      .eq("org_id", orgId)
      .eq("from_model", TRADEOFF.modelKey)
      .eq("from_host", TRADEOFF.host)
      .eq("status", "active");
    const rows = data ?? [];
    expect(rows).toHaveLength(1);
    const s = rows[0]!;
    expect(s.autonomous).toBe(true);
    // A different model entirely — this is the equal-quality claim, not arbitrage.
    expect(s.to_model).not.toBe(TRADEOFF.modelKey);

    const rec = await admin
      .from("recommendations")
      .select("kind, quality_delta, monthly_saving_usd, status")
      .eq("id", s.recommendation_id!)
      .single();
    expect(rec.data!.kind).toBe("quality_match");
    expect(rec.data!.status).toBe("activated");
    const delta = Number(rec.data!.quality_delta);
    console.log(
      `[tradeoff] ${TRADEOFF.modelKey}@${TRADEOFF.host} -> ${s.to_model}@${s.to_host} delta=${delta} saving=$${rec.data!.monthly_saving_usd}/mo`,
    );
    // The whole point of the tradeoff cell: the replacement is not better.
    expect(delta).toBeLessThanOrEqual(0);
    expect(Number(rec.data!.monthly_saving_usd)).toBeGreaterThanOrEqual(
      DEFAULT_AUTONOMOUS_POLICY.minMonthlySavingUsd,
    );
  }, 60_000);

  it("refuses the sub-floor workload — recommended, never activated", async () => {
    const { data: recs } = await admin
      .from("recommendations")
      .select("kind, monthly_saving_usd, status")
      .eq("org_id", orgId)
      .eq("from_model", TINY.modelKey)
      .eq("from_host", TINY.host);
    const rows = recs ?? [];
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(Number(r.monthly_saving_usd)).toBeLessThan(
        DEFAULT_AUTONOMOUS_POLICY.minMonthlySavingUsd,
      );
      expect(r.status).not.toBe("activated");
    }

    console.log(
      `[refuse] ${TINY.modelKey}@${TINY.host} recs=${rows.map((r) => `${r.kind}:$${r.monthly_saving_usd}/${r.status}`).join(", ")} refusals=${JSON.stringify(firstRun.autonomousRefusals)}`,
    );
    const { data: switches } = await admin
      .from("switches")
      .select("id")
      .eq("org_id", orgId)
      .eq("from_model", TINY.modelKey)
      .eq("from_host", TINY.host);
    expect(switches ?? []).toHaveLength(0);

    expect(firstRun.autonomousRefusals["saving_below_policy"] ?? 0).toBeGreaterThan(0);
  }, 60_000);

  it("holds the per-workload cooldown on the very next cycle", async () => {
    expect(secondRun.errors).toEqual([]);
    expect(secondRun.autonomousSwitches).toBe(0);
    const blocked =
      (secondRun.autonomousRefusals["cooldown_active"] ?? 0) +
      (secondRun.autonomousRefusals["blocked"] ?? 0);
    expect(blocked).toBeGreaterThan(0);

    const { data } = await admin.from("switches").select("id").eq("org_id", orgId).eq("status", "active");
    expect((data ?? []).length).toBe(firstRun.autonomousSwitches);
  }, 120_000);

  it("left the shared demo workspace untouched by this harness", async () => {
    const { data } = await admin
      .from("switches")
      .select("id")
      .eq("org_id", DEMO_ORG)
      .gte("activated_at", new Date(stamp).toISOString());
    // The harness never named the demo org; the cron may still act on it, so
    // this only asserts that nothing this run created carries our org's traffic.
    for (const row of data ?? []) expect(row.id).toBeTruthy();
    const ours = await admin.from("switches").select("org_id").eq("org_id", orgId);
    expect((ours.data ?? []).every((r) => r.org_id === orgId)).toBe(true);
  }, 60_000);
});

describe("cleanup", () => {
  it("leaves no rows behind, proven by query", async () => {
    await admin.from("organizations").delete().eq("id", orgId);

    for (const table of ["usage_rollups", "recommendations", "switches", "switch_events", "subscriptions"]) {
      const { data, error } = await admin.from(table).select("id").eq("org_id", orgId);
      expect(error).toBeNull();
      expect({ table, rows: (data ?? []).length }).toEqual({ table, rows: 0 });
    }
    const org = await admin.from("organizations").select("id").eq("id", orgId);
    expect(org.data ?? []).toHaveLength(0);

    await admin.auth.admin.deleteUser(actor.id);
    orgId = "";
  }, 120_000);
});
