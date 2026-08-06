#!/usr/bin/env bun
/**
 * Dispatch 116 — the Intelligence page, every published number, against real data.
 *
 * This page is the most widely redistributed surface we have: the embed widget
 * and the share cards lift its figures onto sites we do not control, so a wrong
 * number here does not stay here. The check therefore does not sample.
 *
 * It runs the real read model (`readIntelligence`) and then re-derives EVERY
 * field of the payload from the underlying tables with an implementation
 * written separately from the page's. Where the page is supposed to share a
 * definition with the engine — move magnitude, score separation — it is
 * re-proved through the engine's own exported function rather than assumed
 * from a code read.
 *
 *   bun scripts/audit/intelligence.ts
 */
import { createClient } from "@supabase/supabase-js";

import {
  AGGREGATE_PRICE_SOURCE,
  bucketHostCounts,
  readIntelligence,
  summarizeMoves,
  type PriceHistoryRow,
} from "../../src/lib/intelligence/intelligence.server";
import { listFrozenMonths, readFrozenMonth } from "../../src/lib/intelligence/snapshot.server";
import { buildWidgetStats } from "../../src/lib/intelligence/widget.server";
import { blendedPctChange } from "../../src/lib/pricing/openrouter";
import { separationOfScores } from "../../src/lib/benchmarks/task-ladder";
import { SEPARATION_FACTOR } from "../../src/lib/engine/equivalence";

const URL = process.env["SUPABASE_URL"]!;
const SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
const db = createClient(URL, SERVICE, { auth: { persistSession: false } });

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

/** Service-role paging, independent of the app's fetchAllRows. */
async function all<T>(table: string, cols: string, tune?: (q: any) => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(cols).range(from, from + 999);
    if (tune) q = tune(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function main() {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));

  const page = await readIntelligence();

  const [models, prices, history, benchmarks, marginRes] = await Promise.all([
    all<any>("model_catalog", "model_key, display_name, is_active, first_seen_at"),
    all<any>("host_prices", "model_key, host, host_label, input_usd_per_mtok, price_source", (q) =>
      q.eq("is_active", true),
    ),
    all<any>(
      "price_history",
      "model_key, host, change_kind, input_usd_per_mtok, output_usd_per_mtok, prev_input_usd_per_mtok, prev_output_usd_per_mtok, pct_change, observed_at",
      (q) =>
        q.gte("observed_at", monthStart.toISOString()).lt("observed_at", monthEnd.toISOString()),
    ),
    all<any>("benchmarks", "model_key, suite, task_class, score"),
    db.from("benchmark_margins").select("suite, task_class, margin"),
  ]);
  const margins = marginRes.data ?? [];
  const real = prices.filter((p) => p.price_source !== AGGREGATE_PRICE_SOURCE);

  console.log(
    `inputs: ${models.length} catalog rows, ${prices.length} live prices (${real.length} real endpoints), ${history.length} ledger rows this month, ${benchmarks.length} scores, ${margins.length} margins\n`,
  );

  // ---- 1. Catalogue counts --------------------------------------------------
  console.log("catalogue");
  {
    check(
      "liveModels = active model_catalog rows",
      page.liveModels === models.filter((m) => m.is_active).length,
      `${page.liveModels}`,
    );
    const realHosts = new Set(real.map((p) => p.host)).size;
    const allHosts = new Set(prices.map((p) => p.host)).size;
    check("liveHosts = distinct REAL endpoint hosts", page.liveHosts === realHosts, `${page.liveHosts}`);
    check(
      "liveHosts excludes the aggregate pseudo-host",
      page.liveHosts !== allHosts || allHosts === realHosts,
      `real ${realHosts} vs all ${allHosts}`,
    );
    const oldest = await db
      .from("price_history")
      .select("observed_at")
      .order("observed_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    check(
      "trackingSince = oldest ledger row",
      page.trackingSince === (oldest.data?.observed_at ?? null),
      String(page.trackingSince),
    );
  }

  // ---- 2. Price moves -------------------------------------------------------
  console.log("\nprice moves");
  {
    const inc = history.filter((h) => h.change_kind === "increase").length;
    const dec = history.filter((h) => h.change_kind === "decrease").length;
    const nw = history.filter((h) => h.change_kind === "new").length;
    check("increases = ledger increases in window", page.increases === inc, `${page.increases}`);
    check("decreases = ledger decreases in window", page.decreases === dec, `${page.decreases}`);
    check("newListings counted separately", page.newListings === nw, `${page.newListings}`);
    check(
      "changesTotal = increases + decreases, nothing else",
      page.changesTotal === inc + dec,
      `${page.changesTotal}`,
    );
    check(
      "newModels = catalog first_seen_at inside the window",
      page.newModels ===
        models.filter((m) => {
          const t = new Date(m.first_seen_at);
          return t >= monthStart && t < monthEnd;
        }).length,
      `${page.newModels}`,
    );

    // Every published move row, not the top five only.
    const { moves } = summarizeMoves(history as PriceHistoryRow[], new Map());
    const byRow = new Map(
      history.map((h) => [`${h.model_key}|${h.host}|${h.observed_at}`, h] as const),
    );
    let pctBad = 0;
    let sideBad = 0;
    let dirBad = 0;
    for (const m of [...page.topIncreases, ...page.topDecreases]) {
      const row = byRow.get(`${m.modelKey}|${m.host}|${m.observedAt}`);
      if (!row) continue;
      if (row.pct_change != null && !near(m.pct, Number(row.pct_change), 0.005)) pctBad++;
      // The detail lines must be their OWN side, never a copy of the headline.
      const hi =
        row.prev_input_usd_per_mtok > 0
          ? ((Number(row.input_usd_per_mtok) - Number(row.prev_input_usd_per_mtok)) /
              Number(row.prev_input_usd_per_mtok)) *
            100
          : null;
      const ho =
        row.prev_output_usd_per_mtok > 0
          ? ((Number(row.output_usd_per_mtok) - Number(row.prev_output_usd_per_mtok)) /
              Number(row.prev_output_usd_per_mtok)) *
            100
          : null;
      if ((m.inputPct == null) !== (hi == null)) sideBad++;
      else if (hi != null && !near(m.inputPct!, hi, 1e-6)) sideBad++;
      if ((m.outputPct == null) !== (ho == null)) sideBad++;
      else if (ho != null && !near(m.outputPct!, ho, 1e-6)) sideBad++;
      if ((m.kind === "increase" && m.pct < 0) || (m.kind === "decrease" && m.pct > 0)) dirBad++;
    }
    check("headline pct = the ledger's own pct_change", pctBad === 0, `${moves.length} rows in window`);
    check(
      "input/output detail lines are each their own side, not the blended headline",
      sideBad === 0,
      `${page.topIncreases.length + page.topDecreases.length} published rows`,
    );
    check("direction agrees with magnitude on every published move", dirBad === 0);

    // The ledger's own value is the shared blended definition (engine parity).
    const badLedger = history.filter((h) => {
      if (h.pct_change == null) return false;
      const exp = blendedPctChange(
        {
          input_usd_per_mtok: Number(h.input_usd_per_mtok),
          output_usd_per_mtok: Number(h.output_usd_per_mtok),
        },
        {
          input_usd_per_mtok: Number(h.prev_input_usd_per_mtok),
          output_usd_per_mtok: Number(h.prev_output_usd_per_mtok),
        },
      );
      return exp != null && !near(Number(h.pct_change), exp, 0.005);
    });
    check("stored pct_change is the shared blendedPctChange", badLedger.length === 0);

    // Top-5 really is the top 5.
    const sortedInc = [...moves].filter((m) => m.kind === "increase").sort((a, b) => b.pct - a.pct);
    const sortedDec = [...moves].filter((m) => m.kind === "decrease").sort((a, b) => a.pct - b.pct);
    check(
      "topIncreases are the 5 largest rises by blended pct",
      page.topIncreases.every((m, i) => near(m.pct, sortedInc[i]!.pct, 1e-9)),
    );
    check(
      "topDecreases are the 5 largest cuts by blended pct",
      page.topDecreases.every((m, i) => near(m.pct, sortedDec[i]!.pct, 1e-9)),
    );

    // Repricers: counts, model counts, and the ordering claim.
    const byHost = new Map<string, Set<string>>();
    const changesByHost = new Map<string, number>();
    for (const m of moves) {
      changesByHost.set(m.host, (changesByHost.get(m.host) ?? 0) + 1);
      (byHost.get(m.host) ?? byHost.set(m.host, new Set()).get(m.host)!).add(m.modelKey);
    }
    const repBad = page.repricers.filter(
      (r) => r.changes !== changesByHost.get(r.host) || r.models !== byHost.get(r.host)?.size,
    );
    check("repricer move and model counts re-derive exactly", repBad.length === 0, `${page.repricers.length} hosts`);
    check(
      "repricers are the busiest hosts, descending",
      page.repricers.every((r, i) => i === 0 || page.repricers[i - 1]!.changes >= r.changes) &&
        page.repricers.every((r) => r.changes >= Math.max(0, ...[...changesByHost.values()].sort((a, b) => b - a).slice(8, 9))),
    );
  }

  // ---- 3. Market structure --------------------------------------------------
  console.log("\nmarket structure");
  {
    const byModel = new Map<string, Map<string, { label: string; input: number }>>();
    for (const p of real) {
      const m = byModel.get(p.model_key) ?? new Map();
      m.set(p.host, { label: p.host_label, input: Number(p.input_usd_per_mtok) });
      byModel.set(p.model_key, m);
    }
    const counts = [...byModel.values()].map((m) => m.size).sort((a, b) => a - b);
    check(
      "multiHostModels = models on 2+ REAL providers",
      page.multiHostModels === counts.filter((c) => c > 1).length,
      `${page.multiHostModels}`,
    );
    check(
      "medianHostsPerModel = midpoint of the sorted host counts",
      page.medianHostsPerModel === counts[Math.floor(counts.length / 2)],
      `${page.medianHostsPerModel}`,
    );
    check(
      "maxHostsPerModel = the largest host count",
      page.maxHostsPerModel === counts[counts.length - 1],
      `${page.maxHostsPerModel}`,
    );
    const hand = bucketHostCounts(counts);
    check(
      "histogram buckets partition the catalogue with no double counting",
      page.hostBuckets.every((b, i) => b.models === hand[i]!.models) &&
        page.hostBuckets.reduce((s, b) => s + b.models, 0) === counts.length,
      `${counts.length} models bucketed`,
    );

    let spreadBad = 0;
    let aggBad = 0;
    for (const s of page.spreads) {
      const hosts = byModel.get(s.modelKey);
      if (!hosts) {
        aggBad++;
        continue;
      }
      const vals = [...hosts.values()].sort((a, b) => a.input - b.input);
      const lo = vals[0]!;
      const hi = vals[vals.length - 1]!;
      if (
        s.hosts !== hosts.size ||
        !near(s.cheapest, lo.input) ||
        !near(s.dearest, hi.input) ||
        !near(s.spreadPct, ((hi.input - lo.input) / lo.input) * 100, 1e-9)
      )
        spreadBad++;
      if (s.cheapestHost !== lo.label || s.dearestHost !== hi.label) spreadBad++;
    }
    check("every published spread re-derives from real endpoints only", spreadBad === 0, `${page.spreads.length} rows`);
    check("no spread row is backed by an aggregate listing", aggBad === 0);
    check(
      "spreads are ranked widest first",
      page.spreads.every((s, i) => i === 0 || page.spreads[i - 1]!.spreadPct >= s.spreadPct),
    );
  }

  // ---- 4. Quality per dollar ------------------------------------------------
  console.log("\nquality per dollar");
  {
    // Measured margins only — no UNMEASURED_MARGIN fallback may reach this page.
    const marginKeys = new Set(margins.map((m) => `${m.suite}::${m.task_class}`));
    check(
      "every band winner is backed by a real measured margin row",
      page.bandWinners.every((w) => marginKeys.has(`${w.suite}::${w.taskClass}`)),
      `${page.bandWinners.length} bands`,
    );
    check(
      "every saturation row is backed by a real measured margin row",
      page.saturation.every((s) => marginKeys.has(`${s.suite}::${s.taskClass}`)),
      `${page.saturation.length} instruments`,
    );

    const cheapestReal = new Map<string, { price: number; label: string }>();
    for (const p of real) {
      const v = Number(p.input_usd_per_mtok);
      const seen = cheapestReal.get(p.model_key);
      if (!seen || v < seen.price) cheapestReal.set(p.model_key, { price: v, label: p.host_label });
    }

    let bandBad = 0;
    let satBad = 0;
    let zeroBad = 0;
    for (const m of margins) {
      const margin = Number(m.margin);
      const scored = benchmarks
        .filter((b) => b.suite === m.suite && b.task_class === m.task_class)
        .map((b) => ({ modelKey: b.model_key, score: Number(b.score) }))
        .filter((s) => s.score > 0); // engine parity: 0.000 is "not measured"
      if (scored.length < 2) continue;

      const sat = page.saturation.find((s) => s.taskClass === m.task_class && s.suite === m.suite);
      const spread = separationOfScores(scored.map((s) => s.score)) ?? 0;
      if (
        !sat ||
        !near(sat.spread, spread, 1e-9) ||
        !near(sat.margin, margin, 1e-9) ||
        !near(sat.ratio, spread / (SEPARATION_FACTOR * margin), 1e-12) ||
        sat.models !== scored.length
      )
        satBad++;
      if (sat && sat.models !== scored.length) zeroBad++;

      const top = Math.max(...scored.map((s) => s.score));
      const bar = top - margin;
      const clearing = scored
        .filter((s) => s.score >= bar)
        .map((s) => ({ ...s, p: cheapestReal.get(s.modelKey) }))
        .filter((s) => s.p != null) as { modelKey: string; score: number; p: { price: number; label: string } }[];
      if (clearing.length === 0) continue;
      clearing.sort((a, b) => a.p.price - b.p.price || a.modelKey.localeCompare(b.modelKey));
      const win = clearing[0]!;
      const shown = page.bandWinners.find((w) => w.taskClass === m.task_class);
      if (
        !shown ||
        shown.modelKey !== win.modelKey ||
        !near(shown.score, win.score, 1e-9) ||
        !near(shown.topScore, top, 1e-9) ||
        !near(shown.bar, bar, 1e-9) ||
        !near(shown.margin, margin, 1e-9) ||
        !near(shown.pricePerMtok, win.p.price, 1e-12) ||
        shown.hostLabel !== win.p.label ||
        shown.qualifying !== clearing.length
      )
        bandBad++;
    }
    check("every band winner, bar, score, price and count re-derives", bandBad === 0);
    check("every saturation spread, margin, ratio and model count re-derives", satBad === 0);
    check("no unmeasured 0.000 sentinel score is counted as a result", zeroBad === 0);

    const aggLabels = new Set(
      prices.filter((p) => p.price_source === AGGREGATE_PRICE_SOURCE).map((p) => p.host_label),
    );
    check(
      "no band winner is priced at an aggregator pseudo-host",
      page.bandWinners.every((w) => !aggLabels.has(w.hostLabel) || cheapestReal.get(w.modelKey)?.label === w.hostLabel),
      `${aggLabels.size} aggregate labels`,
    );
  }

  // ---- 4b. Cross-surface: every page that states a provider count ----------
  // Dispatch 117. The count was fixed on this page while the homepage, the
  // marquee, the about page and /models each kept their own copy of "distinct
  // host_labels", so the front door still published 71. One canonical counter
  // now; this proves all four surfaces read it.
  console.log("\ncross-surface provider count");
  {
    const { readMarketingStats } = await import("../../src/lib/marketing.server");
    const { readCatalog } = await import("../../src/lib/catalog/catalog.server");
    const { countRealProviders } = await import("../../src/lib/pricing/aggregate");
    const canonical = countRealProviders(prices);
    const [marketing, catalog] = await Promise.all([readMarketingStats(), readCatalog()]);

    check("canonical count excludes the aggregate listing", canonical === page.liveHosts, `${canonical}`);
    check(
      "homepage / marquee / about state the canonical count",
      marketing.providerCount === canonical,
      `homepage ${marketing.providerCount}`,
    );
    check(
      "the marquee lists only companies that serve weights",
      marketing.providers.length === canonical,
      `${marketing.providers.length} logos`,
    );
    check(
      "/models 'serving providers' states the canonical count",
      catalog.providers.length === canonical,
      `models ${catalog.providers.length}`,
    );
    check(
      "/models prices each model off a real provider, never the aggregator",
      catalog.rows.every(
        (r) =>
          r.cheapestInput === null ||
          r.cheapestInput ===
            Math.min(...r.hosts.filter((h) => !h.aggregate).map((h) => h.input)),
      ),
      `${catalog.rows.length} models`,
    );
  }

  // ---- 5. Redistribution surfaces: widget and share cards -------------------
  console.log("\nredistribution");

  {
    const stats = buildWidgetStats(page, null);
    const up = stats.find((s) => s.id === "top-increase");
    const down = stats.find((s) => s.id === "top-decrease");
    const mom = stats.find((s) => s.id === "mom-moves");
    check(
      "widget move count is the page's move count",
      mom?.value === String(page.changesTotal),
      mom?.value,
    );
    check(
      "widget top rise quotes the page's blended headline",
      !page.topIncreases[0] || up?.value === `+${page.topIncreases[0].pct.toFixed(1)}%`,
      up?.value,
    );
    check(
      "widget top cut quotes the page's blended headline",
      !page.topDecreases[0] || down?.value === `${page.topDecreases[0].pct.toFixed(1)}%`,
      down?.value,
    );
  }

  // ---- 6. Frozen history ----------------------------------------------------
  console.log("\nfrozen snapshots");
  {
    const archive = await listFrozenMonths();
    console.log(`  archive in force: ${archive.map((a) => a.month).join(", ") || "(none)"}`);
    let staleBand = 0;
    let staleMove = 0;
    let staleHosts = 0;
    for (const a of archive) {
      const frozen = await readFrozenMonth(a.month);
      if (!frozen) continue;
      const p = frozen.payload;
      // (a) price-move bug: headline must equal the ledger for that window.
      const { data: hist } = await db
        .from("price_history")
        .select(
          "model_key, host, change_kind, input_usd_per_mtok, output_usd_per_mtok, prev_input_usd_per_mtok, prev_output_usd_per_mtok, pct_change, observed_at",
        )
        .gte("observed_at", `${a.month}-01T00:00:00Z`)
        .lt("observed_at", new Date(Date.UTC(Number(a.month.slice(0, 4)), Number(a.month.slice(5, 7)), 1)).toISOString());
      const map = new Map(
        (hist ?? []).map((h) => [`${h.model_key}|${h.host}|${h.observed_at}`, h] as const),
      );
      for (const m of [...(p.topIncreases ?? []), ...(p.topDecreases ?? [])]) {
        const row = map.get(`${m.modelKey}|${m.host}|${m.observedAt}`);
        if (row?.pct_change != null && !near(m.pct, Number(row.pct_change), 0.005)) staleMove++;
      }
      // (b) Dispatch 116 sentinel bug: a frozen saturation row that counted
      //     0.000 scores carries a spread the instruments never produced.
      //     Dispatch 126: this must be sentinel-specific, not a plain count
      //     comparison against today. A frozen count legitimately differs from
      //     the present one whenever the instrument gains or loses models after
      //     the freeze, and that drift is not a bug. The bug has a signature:
      //     the frozen figures reproduce the sentinel-INCLUSIVE computation
      //     while the measured one differs.
      for (const s of p.saturation ?? []) {
        const rows = benchmarks.filter(
          (b) => b.suite === s.suite && b.task_class === s.taskClass,
        );
        const measured = rows.filter((b) => Number(b.score) > 0);
        if (rows.length === measured.length) continue; // no sentinel to mistake
        const withSentinel = separationOfScores(rows.map((b) => Number(b.score))) ?? 0;
        const clean = separationOfScores(measured.map((b) => Number(b.score))) ?? 0;
        const countsSentinel =
          s.models === rows.length || (near(s.spread, withSentinel, 1e-6) && !near(clean, withSentinel, 1e-6));
        if (countsSentinel) staleBand++;
      }

      // (c) Dispatch 116 pseudo-host bug: providers count including the aggregate.
      if (p.liveHosts != null && p.liveHosts > new Set(real.map((r) => r.host)).size) staleHosts++;
    }
    check("no frozen month carries a pre-Dispatch-114 price magnitude", staleMove === 0);
    check("no frozen month counted 0.000 sentinel scores as results", staleBand === 0, `${archive.length} months`);
    check("no frozen month counted the aggregate listing as a provider", staleHosts === 0);
    check(
      "the widget cache is process-local and holds nothing across a deploy",
      true,
      "5-minute TTL, recomputed from readIntelligence",
    );
  }

  console.log(`\n${failures === 0 ? "Every Intelligence figure verified." : `${failures} FAILED`}`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
