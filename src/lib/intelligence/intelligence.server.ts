import { createPublicServerClient } from "@/lib/supabase-public.server";
import { fetchAllRows } from "@/lib/paginate.server";
import { SEPARATION_FACTOR } from "@/lib/engine/equivalence";
import { separationOfScores } from "@/lib/benchmarks/task-ladder";
import { blendedPctChange } from "@/lib/pricing/openrouter";

/**
 * Market intelligence read model.
 *
 * Every figure below is computed from rows we actually hold — the live catalogue
 * (`model_catalog`, `host_prices`), the append-only `price_history` ledger and the
 * measured benchmark instruments (`benchmarks` x `benchmark_margins`). Nothing is
 * estimated, extrapolated or placeheld: a section with no real data returns an
 * empty list and the page simply does not draw it.
 *
 * The "pseudo-host" caveat: the OpenRouter feed publishes both a per-endpoint row
 * (a real provider serving the weights) and an aggregate listing row. Any claim of
 * the form "same weights, different provider" filters `price_source` to real
 * endpoints only, so the spread we publish is a genuine provider-to-provider gap.
 */

export const AGGREGATE_PRICE_SOURCE = "openrouter-aggregate";

export interface PriceMove {
  modelKey: string;
  host: string;
  hostLabel: string;
  /** The ledger's own verdict for this row. Direction is never re-derived from one side. */
  kind: "increase" | "decrease";
  inputNow: number | null;
  inputPrev: number | null;
  inputPct: number | null;
  outputNow: number | null;
  outputPrev: number | null;
  outputPct: number | null;
  /**
   * The headline signed % move: the ledger's own `pct_change`, which is blended
   * across input and output (see {@link blendedPctChange}).
   *
   * Dispatch 114: this used to be re-derived here, input side first. A row that
   * took input 0.400 -> 0.980 while output fell 4.00 -> 3.95 published +145.0%
   * against a ledger that said +12.05%. Direction came from `change_kind` and
   * magnitude from a different formula, so the two could disagree by
   * construction. They now come from the same row and cannot.
   *
   * `inputPct` / `outputPct` remain as the supplementary detail lines, so a
   * split move stays visible — it is just no longer the headline.
   */
  pct: number;
  observedAt: string;
}

/** Rows fed to {@link summarizeMoves} — the subset of `price_history` we read. */
export interface PriceHistoryRow {
  model_key: string;
  host: string;
  change_kind: string;
  input_usd_per_mtok: number | string | null;
  output_usd_per_mtok: number | string | null;
  prev_input_usd_per_mtok: number | string | null;
  prev_output_usd_per_mtok: number | string | null;
  pct_change: number | string | null;
  observed_at: string;
}

export interface RepricerRow {
  host: string;
  hostLabel: string;
  changes: number;
  models: number;
}

export interface SpreadRow {
  modelKey: string;
  displayName: string;
  hosts: number;
  cheapest: number;
  cheapestHost: string;
  dearest: number;
  dearestHost: string;
  spreadPct: number;
}

export interface BandWinner {
  taskClass: string;
  suite: string;
  margin: number;
  bar: number;
  topScore: number;
  modelKey: string;
  displayName: string;
  score: number;
  pricePerMtok: number;
  hostLabel: string;
  qualifying: number;
}

export interface SaturationRow {
  taskClass: string;
  suite: string;
  spread: number;
  margin: number;
  /** spread / (SEPARATION_FACTOR x margin). <= 1 means the instrument is saturated. */
  ratio: number;
  models: number;
}

/** Distribution of models by how many real providers serve them. */
export interface HostBucket {
  label: string;
  models: number;
}

/** Buckets, in order, for the market-structure histogram. */
export function bucketHostCounts(counts: number[]): HostBucket[] {
  const defs: { label: string; test: (n: number) => boolean }[] = [
    { label: "1", test: (n) => n === 1 },
    { label: "2–3", test: (n) => n >= 2 && n <= 3 },
    { label: "4–9", test: (n) => n >= 4 && n <= 9 },
    { label: "10+", test: (n) => n >= 10 },
  ];
  return defs.map((d) => ({ label: d.label, models: counts.filter(d.test).length }));
}

export interface IntelligencePayload {
  generatedAt: string;
  monthLabel: string;
  monthStart: string;
  trackingSince: string | null;
  liveModels: number;
  liveHosts: number;
  changesTotal: number;
  increases: number;
  decreases: number;
  newListings: number;
  newModels: number;
  topIncreases: PriceMove[];
  topDecreases: PriceMove[];
  repricers: RepricerRow[];
  spreads: SpreadRow[];
  multiHostModels: number;
  medianHostsPerModel: number;
  maxHostsPerModel: number;
  hostBuckets: HostBucket[];
  bandWinners: BandWinner[];
  saturation: SaturationRow[];
}

const pct = (now: number | null, prev: number | null): number | null =>
  now == null || prev == null || prev === 0 ? null : ((now - prev) / prev) * 100;

const num = (v: unknown): number | null => (v == null ? null : Number(v));

/**
 * Turn raw `price_history` rows into the move buckets the page publishes.
 *
 * Invariant this function exists to guarantee:
 *   `moves.length === increases.length + decreases.length`
 * "Total moves" therefore means increases + decreases and nothing else; new
 * listings are counted separately and are NEVER folded into that total.
 *
 * Direction AND magnitude both come from the ledger row: `change_kind` and
 * `pct_change`, written together by `diffPrice` at sync time. Nothing about a
 * move is re-derived here. `pct_change` is only recomputed when a legacy row
 * stored none, and then through the same exported blended definition rather
 * than a second formula.
 */
export function summarizeMoves(
  rows: PriceHistoryRow[],
  labelByHost: Map<string, string>,
): {
  moves: PriceMove[];
  increases: PriceMove[];
  decreases: PriceMove[];
  newListings: number;
} {
  const moves: PriceMove[] = rows
    .filter((h) => h.change_kind === "increase" || h.change_kind === "decrease")
    .map((h) => {
      const inputNow = num(h.input_usd_per_mtok);
      const inputPrev = num(h.prev_input_usd_per_mtok);
      const outputNow = num(h.output_usd_per_mtok);
      const outputPrev = num(h.prev_output_usd_per_mtok);
      const ledgerPct = num(h.pct_change);
      const fallback =
        inputNow != null && outputNow != null && inputPrev != null && outputPrev != null
          ? blendedPctChange(
              { input_usd_per_mtok: inputNow, output_usd_per_mtok: outputNow },
              { input_usd_per_mtok: inputPrev, output_usd_per_mtok: outputPrev },
            )
          : null;
      return {
        modelKey: h.model_key,
        host: h.host,
        hostLabel: labelByHost.get(h.host) ?? h.host,
        kind: h.change_kind as "increase" | "decrease",
        inputNow,
        inputPrev,
        inputPct: pct(inputNow, inputPrev),
        outputNow,
        outputPrev,
        outputPct: pct(outputNow, outputPrev),
        pct: ledgerPct ?? fallback ?? 0,
        observedAt: h.observed_at,
      };
    });

  return {
    moves,
    increases: moves.filter((m) => m.kind === "increase"),
    decreases: moves.filter((m) => m.kind === "decrease"),
    newListings: rows.filter((h) => h.change_kind === "new").length,
  };
}

/**
 * Compute the read model.
 *
 * `monthStartOverride` freezes the reporting window to one specific month —
 * that is how a closed month is snapshotted at month-end and how a restatement
 * recomputes the same window later. Without it the window is the open month.
 */
export async function readIntelligence(monthStartOverride?: Date): Promise<IntelligencePayload> {
  const supabase = createPublicServerClient();
  const now = new Date();
  const monthStart =
    monthStartOverride ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1),
  );

  const [models, prices, history, oldestRes, benchmarks, marginRes] = await Promise.all([
    fetchAllRows((f, t) =>
      supabase
        .from("model_catalog")
        .select("model_key, display_name, vendor, is_active, first_seen_at")
        .range(f, t),
    ),
    fetchAllRows((f, t) =>
      supabase
        .from("host_prices")
        .select("model_key, host, host_label, input_usd_per_mtok, output_usd_per_mtok, price_source")
        .eq("is_active", true)
        .range(f, t),
    ),
    fetchAllRows((f, t) =>
      supabase
        .from("price_history")
        .select(
          "model_key, host, change_kind, input_usd_per_mtok, output_usd_per_mtok, prev_input_usd_per_mtok, prev_output_usd_per_mtok, pct_change, observed_at",
        )
        .gte("observed_at", monthStart.toISOString())
        .lt("observed_at", monthEnd.toISOString())
        .range(f, t),
    ),

    supabase
      .from("price_history")
      .select("observed_at")
      .order("observed_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    fetchAllRows((f, t) =>
      supabase.from("benchmarks").select("model_key, suite, task_class, score").range(f, t),
    ),
    supabase.from("benchmark_margins").select("suite, task_class, margin"),
  ]);

  const margins = marginRes.data ?? [];


  const activeModels = models.filter((m) => m.is_active);
  const nameByKey = new Map(models.map((m) => [m.model_key, m.display_name]));
  const labelByHost = new Map(prices.map((p) => [p.host, p.host_label]));

  // ---- Price moves this month -------------------------------------------------
  const { moves, increases, decreases, newListings } = summarizeMoves(
    history as PriceHistoryRow[],
    labelByHost,
  );

  // ---- Repricing frequency (trailing window = everything we hold) --------------
  const byHost = new Map<string, { changes: number; models: Set<string> }>();
  for (const m of moves) {
    const entry = byHost.get(m.host) ?? { changes: 0, models: new Set<string>() };
    entry.changes += 1;
    entry.models.add(m.modelKey);
    byHost.set(m.host, entry);
  }
  const repricers: RepricerRow[] = [...byHost.entries()]
    .map(([host, v]) => ({
      host,
      hostLabel: labelByHost.get(host) ?? host,
      changes: v.changes,
      models: v.models.size,
    }))
    .sort((a, b) => b.changes - a.changes || a.hostLabel.localeCompare(b.hostLabel))
    .slice(0, 8);

  // ---- Market structure: same weights, different real provider ----------------
  const realEndpoints = prices.filter((p) => p.price_source !== AGGREGATE_PRICE_SOURCE);
  const byModel = new Map<string, { host: string; label: string; input: number }[]>();
  for (const p of realEndpoints) {
    const list = byModel.get(p.model_key) ?? [];
    list.push({
      host: p.host,
      label: p.host_label,
      input: Number(p.input_usd_per_mtok),
    });
    byModel.set(p.model_key, list);
  }

  const hostCounts: number[] = [];
  const spreads: SpreadRow[] = [];
  for (const [modelKey, list] of byModel) {
    const distinct = new Map(list.map((l) => [l.host, l]));
    hostCounts.push(distinct.size);
    if (distinct.size < 2) continue;
    const sorted = [...distinct.values()].sort((a, b) => a.input - b.input);
    const lo = sorted[0];
    const hi = sorted[sorted.length - 1];
    if (lo.input <= 0) continue;
    spreads.push({
      modelKey,
      displayName: nameByKey.get(modelKey) ?? modelKey,
      hosts: distinct.size,
      cheapest: lo.input,
      cheapestHost: lo.label,
      dearest: hi.input,
      dearestHost: hi.label,
      spreadPct: ((hi.input - lo.input) / lo.input) * 100,
    });
  }
  spreads.sort((a, b) => b.spreadPct - a.spreadPct);
  hostCounts.sort((a, b) => a - b);

  // ---- Quality per dollar: cheapest model clearing its measured band ----------
  // Dispatch 116: priced off REAL endpoints only, exactly like the spread
  // section above. The aggregate listing is one pseudo-host that carries the
  // cheapest input price for 150 of 306 models, so pricing off `prices` could
  // publish "cheapest listing at <aggregator>" — a price no provider serves.
  const cheapestPrice = new Map<string, { price: number; label: string }>();
  for (const p of realEndpoints) {
    const input = Number(p.input_usd_per_mtok);
    const seen = cheapestPrice.get(p.model_key);
    if (!seen || input < seen.price) cheapestPrice.set(p.model_key, { price: input, label: p.host_label });
  }


  const bandWinners: BandWinner[] = [];
  const saturation: SaturationRow[] = [];
  // Only suites with a real measured margin row may back a published claim —
  // no UNMEASURED_MARGIN fallback ever appears on this page.
  for (const m of margins) {
    const margin = Number(m.margin);
    const scored = benchmarks
      .filter((b) => b.suite === m.suite && b.task_class === m.task_class)
      .map((b) => ({ modelKey: b.model_key, score: Number(b.score) }))
      // Dispatch 116: a stored 0.000 is the sync's "not measured on this
      // instrument" sentinel, not a result. The engine refuses on it
      // (equivalence.ts:211); this page used to count it, which widened the
      // published lcr separation to 75.67 across "126 models" when the real
      // measured figures are 74.00 across 120.
      .filter((s) => s.score > 0);
    if (scored.length < 2) continue;


    const scores = scored.map((s) => s.score);
    // Same measurement as every other separation figure in the system, so
    // it comes from the same function rather than being re-typed here.
    const spread = separationOfScores(scores) ?? 0;
    saturation.push({
      taskClass: m.task_class,
      suite: m.suite,
      spread,
      margin,
      ratio: spread / (SEPARATION_FACTOR * margin),
      models: scored.length,
    });

    const topScore = Math.max(...scores);
    const bar = topScore - margin;
    const clearing = scored
      .filter((s) => s.score >= bar)
      .map((s) => ({ ...s, price: cheapestPrice.get(s.modelKey) }))
      .filter((s) => s.price != null) as { modelKey: string; score: number; price: { price: number; label: string } }[];
    if (clearing.length === 0) continue;
    clearing.sort((a, b) => a.price.price - b.price.price || a.modelKey.localeCompare(b.modelKey));
    const win = clearing[0];
    bandWinners.push({
      taskClass: m.task_class,
      suite: m.suite,
      margin,
      bar,
      topScore,
      modelKey: win.modelKey,
      displayName: nameByKey.get(win.modelKey) ?? win.modelKey,
      score: win.score,
      pricePerMtok: win.price.price,
      hostLabel: win.price.label,
      qualifying: clearing.length,
    });
  }
  bandWinners.sort((a, b) => a.taskClass.localeCompare(b.taskClass));
  saturation.sort((a, b) => a.ratio - b.ratio);

  return {
    generatedAt: now.toISOString(),
    monthStart: monthStart.toISOString(),
    monthLabel: monthStart.toLocaleString("en-GB", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
    trackingSince: oldestRes.data?.observed_at ?? null,
    liveModels: activeModels.length,
    liveHosts: new Set(prices.map((p) => p.host)).size,
    changesTotal: moves.length,
    increases: increases.length,
    decreases: decreases.length,
    newListings,
    // Genuinely new models only — a backfilled catalogue reads 0 here until one lands.
    newModels: models.filter((m) => {
      const t = new Date(m.first_seen_at);
      return t >= monthStart && t < monthEnd;
    }).length,

    topIncreases: [...increases].sort((a, b) => b.pct - a.pct).slice(0, 5),
    topDecreases: [...decreases].sort((a, b) => a.pct - b.pct).slice(0, 5),
    repricers,
    spreads: spreads.slice(0, 8),
    multiHostModels: hostCounts.filter((c) => c > 1).length,
    medianHostsPerModel: hostCounts.length ? hostCounts[Math.floor(hostCounts.length / 2)] : 0,
    maxHostsPerModel: hostCounts.length ? hostCounts[hostCounts.length - 1] : 0,
    hostBuckets: bucketHostCounts(hostCounts),
    bandWinners,
    saturation,
  };
}
