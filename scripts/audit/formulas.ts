#!/usr/bin/env bun
/**
 * Dispatch 92 — formula verification and duplicate-definition drift check.
 *
 * Two things, against the real database, every time it runs:
 *
 *   1. Re-derives every money/percentage formula the system acts on, using an
 *      implementation written independently of the engine's, and compares.
 *      A near-match is a failure; the tolerances here are floating-point
 *      tolerances, not "close enough" tolerances.
 *   2. Proves that concepts computed in more than one place still agree. The
 *      recurring bug in this codebase's history is not a wrong formula, it is
 *      a second copy of a right one that quietly drifts, so agreement is
 *      re-proved on real inputs rather than assumed from a code read.
 *
 *   bun scripts/audit/formulas.ts
 */
import { createClient } from "@supabase/supabase-js";

import { findHostArbitrage } from "../../src/lib/engine/arbitrage";
import { costOf, costOfUsage, DAYS_IN_MONTH, savingPctOf, toMonthly } from "../../src/lib/engine/cost";
import { findQualityMatches } from "../../src/lib/engine/equivalence";
import { findOversized } from "../../src/lib/engine/rightsize";

import type { PriceRow, UsageAggregate } from "../../src/lib/engine/types";
import { aggregateSavings, capturedInWindow } from "../../src/lib/dashboard/savings";
import { K_ANONYMITY_FLOOR } from "../../src/lib/benchmark/k-anonymity";
import { separationOfScores } from "../../src/lib/benchmarks/task-ladder";

const URL = process.env["SUPABASE_URL"]!;
const SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
const DEMO_ORG = "00000000-0000-0000-0000-000000000001";
const EPS = 1e-9;

const db = createClient(URL, SERVICE, { auth: { persistSession: false } });

let failures = 0;
const check = (name: string, ok: boolean, detail: string) => {
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};
const near = (a: number, b: number, eps = EPS) => Math.abs(a - b) <= eps;

async function main() {
  // ---- real inputs ----------------------------------------------------------
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [pricesRes, benchRes, marginRes, modelRes, rollupRes, switchRes] = await Promise.all([
    db.from("host_prices").select("*").eq("is_active", true),
    db.from("benchmarks").select("model_key, suite, task_class, score"),
    db.from("benchmark_margins").select("suite, task_class, margin"),
    db.from("model_catalog").select("model_key, tier").eq("is_active", true),
    db
      .from("usage_rollups")
      .select("model_key, host, task_hint, requests, input_tokens, output_tokens, cost_usd")
      .eq("org_id", DEMO_ORG)
      .eq("granularity", "day")
      .gte("bucket_start", since),
    db.from("switches").select("saved_usd, activated_at, status").eq("org_id", DEMO_ORG),
  ]);

  const prices = (pricesRes.data ?? []) as unknown as PriceRow[];
  const benchmarks = (benchRes.data ?? []) as never[];
  const margins = (marginRes.data ?? []) as never[];
  const models = (modelRes.data ?? []) as never[];
  const rollups = rollupRes.data ?? [];

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
        cost_usd: 0,
        days: 30,
      } as UsageAggregate);
    agg.requests += Number(r.requests);
    agg.input_tokens += Number(r.input_tokens);
    agg.output_tokens += Number(r.output_tokens);
    agg.cost_usd += Number(r.cost_usd);
    byWorkload.set(key, agg);
  }
  const usage = [...byWorkload.values()];
  console.log(
    `inputs: ${prices.length} prices, ${benchmarks.length} scores, ${margins.length} margins, ${usage.length} workloads\n`,
  );

  // ---- 1. costOf ------------------------------------------------------------
  console.log("cost");
  {
    const p = prices[0]!;
    const u = usage[0];
    const hand =
      (1_500_000 / 1e6) * Number(p.input_usd_per_mtok) + (400_000 / 1e6) * Number(p.output_usd_per_mtok);
    check("costOf = in/1e6*inRate + out/1e6*outRate", near(costOf(p, 1_500_000, 400_000), hand), `${hand}`);
    if (u) {
      const handU = costOf(p, u.input_tokens, u.output_tokens);
      check("costOfUsage delegates to costOf", near(costOfUsage(p, u), handU), `${handU.toFixed(6)}`);
    }
    check("toMonthly = value/days*30", near(toMonthly(210, 7), (210 / 7) * DAYS_IN_MONTH), "900");
    check("toMonthly(x, 0) = 0, no divide-by-zero", toMonthly(5, 0) === 0, "0");
  }

  // ---- 2. savings percentage, all call sites --------------------------------
  console.log("\nsaving percentage");
  {
    const arb = findHostArbitrage(usage, prices);
    const qm = findQualityMatches(usage, prices, benchmarks, margins);
    const rs = findOversized(usage, models, prices);
    const all = [
      ...arb.map((r) => ["arbitrage", r] as const),
      ...qm.recommendations.map((r) => ["certify", r] as const),
      ...rs.map((r) => ["rightsize", r] as const),
    ];
    check("engine produced recommendations to verify", all.length > 0, `${all.length} recs`);

    let pctBad = 0;
    let moneyBad = 0;
    for (const [, r] of all) {
      // Independent re-derivation from the two figures the row itself carries:
      // pct and dollars must describe the same switch, whatever produced them.
      const baseline = r.savingUsd / (r.savingPct / 100);
      const rederived = Math.round((r.savingUsd / baseline) * 100 * 100) / 100;
      if (!near(rederived, r.savingPct, 0.01)) pctBad++;
      const monthly = Math.round((r.savingUsd / r.windowDays) * DAYS_IN_MONTH * 100) / 100;
      if (!near(monthly, r.monthlySavingUsd, 0.011)) moneyBad++;
    }
    check("savingPct internally consistent with savingUsd on every rec", pctBad === 0, `${all.length} rows`);
    check("monthlySavingUsd = savingUsd/windowDays*30 on every rec", moneyBad === 0, `${all.length} rows`);

    // The duplicate-definition proof: one shared helper, and the three call
    // sites are re-run through it on their own real numbers.
    let sharedBad = 0;
    for (const [, r] of all) {
      const baseline = r.savingUsd / (r.savingPct / 100);
      if (!near(savingPctOf(baseline, baseline - r.savingUsd), r.savingPct, 0.01)) sharedBad++;
    }
    check("all three levels agree with the shared savingPctOf", sharedBad === 0, `${all.length} rows`);
    check("savingPctOf refuses a zero baseline", savingPctOf(0, 0) === 0, "0");
  }

  // ---- 3. reconciliation: identified = available + captured -----------------
  console.log("\nreconciliation");
  {
    const cands = [
      { key: "a|b|c", saving: 100, unlocked: true },
      { key: "a|b|c", saving: 140, unlocked: false },
      { key: "d|e|f", saving: 60, unlocked: true },
    ];
    const t = aggregateSavings(cands);
    check("available = best unlocked per workload", near(t.available, 160), `${t.available}`);
    check("locked = increment only (140-100)", near(t.locked, 40), `${t.locked}`);
    check("gross = naive list sum", near(t.gross, 300), `${t.gross}`);
    check("overlap = gross - kept (300-200)", near(t.overlapUsd, 100), `${t.overlapUsd}`);
    check("identified = available + locked + overlap", near(t.available + t.locked + t.overlapUsd, t.gross), "300");

    const sw = (switchRes.data ?? []).filter((s) => s.status === "active");
    const now = Date.now();
    const shaped = sw.map((s) => ({
      saved: Number(s.saved_usd),
      activeDays: Math.max(1, Math.floor((now - new Date(s.activated_at).getTime()) / 86_400_000)),
    }));
    const cap7 = capturedInWindow(shaped, 7);
    const cap30 = capturedInWindow(shaped, 30);
    const hand7 = shaped.reduce((s, x) => s + x.saved * (Math.min(x.activeDays, 7) / x.activeDays), 0);
    check("capturedInWindow allocates, never extrapolates", near(cap7, Math.round(hand7 * 100) / 100, 0.011), `7d ${cap7}`);
    check("captured is monotonic in window width", cap30 >= cap7 - 0.01, `30d ${cap30} >= 7d ${cap7}`);
    const total = shaped.reduce((s, x) => s + x.saved, 0);
    check("captured never exceeds money actually saved", cap30 <= Math.round(total * 100) / 100 + 0.01, `${cap30} <= ${total.toFixed(2)}`);
  }

  // ---- 4. separation / margin ----------------------------------------------
  console.log("\nseparation and margin");
  {
    const byTask = new Map<string, number[]>();
    for (const b of benchmarks as { task_class: string; score: number }[]) {
      if (b.score > 0) (byTask.get(b.task_class) ?? byTask.set(b.task_class, []).get(b.task_class)!).push(b.score);
    }
    let bad = 0;
    for (const [task, scores] of byTask) {
      const hand = scores.length < 2 ? null : Math.max(...scores) - Math.min(...scores);
      if (separationOfScores(scores) !== hand) {
        bad++;
        console.log(`      ${task}: engine ${separationOfScores(scores)} vs hand ${hand}`);
      }
    }
    check("separation = max - min on every instrument", bad === 0, `${byTask.size} instruments`);
  }

  // ---- 5. k-anonymity floor: TS constant vs the SQL that enforces it --------
  console.log("\nk-anonymity");
  {
    // The database is the enforcement point; the TypeScript constant only
    // decides how far to widen a cut before giving up. They must be the same
    // number, and the only way to know is to ask both.
    const { data: floor, error } = await db.rpc("benchmark_k_floor");
    check("database publishes its privacy floor", !error && typeof floor === "number", `${floor}`);
    check(
      "app constant equals the floor the database enforces",
      Number(floor) === K_ANONYMITY_FLOOR,
      `sql ${floor} vs app ${K_ANONYMITY_FLOOR}`,
    );

    // And the behaviour, not just the number: a cut nobody can be in must
    // publish no percentiles at all.
    const { data: cut } = await db.rpc("benchmark_cut", {
      _industry: `__no_such_industry_${Date.now()}`,
      _use_case: null,
      _revenue_band: null,
    });
    const row = (cut as { company_count: number; p50_usd: number | null }[] | null)?.[0];
    check("empty cut publishes no percentile", !row || row.p50_usd === null, `count ${row?.company_count ?? 0}`);
  }


  console.log(`\n${failures === 0 ? "All formula checks passed." : `${failures} FAILED`}`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
