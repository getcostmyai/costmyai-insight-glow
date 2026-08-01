import { createPublicServerClient } from "@/lib/supabase-public.server";
import { MAX_CATALOG_ROWS } from "@/lib/catalog-limits";
import { SEPARATION_FACTOR } from "@/lib/engine/equivalence";

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
   * Signed % move used for ranking only: the input side when it moved, otherwise
   * the output side. Some rows reprice output only — ranking must not silently
   * drop them (that is what made 11 + 23 fail to equal 36).
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
  bandWinners: BandWinner[];
  saturation: SaturationRow[];
}

const pct = (now: number | null, prev: number | null): number | null =>
  now == null || prev == null || prev === 0 ? null : ((now - prev) / prev) * 100;

const num = (v: unknown): number | null => (v == null ? null : Number(v));

export async function readIntelligence(): Promise<IntelligencePayload> {
  const supabase = createPublicServerClient();
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [modelsRes, pricesRes, historyRes, oldestRes, benchRes, marginRes] = await Promise.all([
    supabase
      .from("model_catalog")
      .select("model_key, display_name, vendor, is_active, first_seen_at")
      .limit(MAX_CATALOG_ROWS),
    supabase
      .from("host_prices")
      .select("model_key, host, host_label, input_usd_per_mtok, output_usd_per_mtok, price_source")
      .eq("is_active", true)
      .limit(MAX_CATALOG_ROWS),
    supabase
      .from("price_history")
      .select(
        "model_key, host, change_kind, input_usd_per_mtok, output_usd_per_mtok, prev_input_usd_per_mtok, prev_output_usd_per_mtok, observed_at",
      )
      .gte("observed_at", monthStart.toISOString())
      .limit(MAX_CATALOG_ROWS),
    supabase
      .from("price_history")
      .select("observed_at")
      .order("observed_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("benchmarks")
      .select("model_key, suite, task_class, score")
      .limit(MAX_CATALOG_ROWS),
    supabase.from("benchmark_margins").select("suite, task_class, margin"),
  ]);

  const models = modelsRes.data ?? [];
  const prices = pricesRes.data ?? [];
  const history = historyRes.data ?? [];
  const benchmarks = benchRes.data ?? [];
  const margins = marginRes.data ?? [];

  const activeModels = models.filter((m) => m.is_active);
  const nameByKey = new Map(models.map((m) => [m.model_key, m.display_name]));
  const labelByHost = new Map(prices.map((p) => [p.host, p.host_label]));

  // ---- Price moves this month -------------------------------------------------
  const moves: PriceMove[] = history
    .filter((h) => h.change_kind === "increase" || h.change_kind === "decrease")
    .map((h) => {
      const inputNow = num(h.input_usd_per_mtok);
      const inputPrev = num(h.prev_input_usd_per_mtok);
      const outputNow = num(h.output_usd_per_mtok);
      const outputPrev = num(h.prev_output_usd_per_mtok);
      const inputPct = pct(inputNow, inputPrev);
      return {
        modelKey: h.model_key,
        host: h.host,
        hostLabel: labelByHost.get(h.host) ?? h.host,
        inputNow,
        inputPrev,
        inputPct,
        outputNow,
        outputPrev,
        outputPct: pct(outputNow, outputPrev),
        pct: inputPct ?? 0,
        observedAt: h.observed_at,
      };
    });

  const increases = moves.filter((m) => m.pct > 0);
  const decreases = moves.filter((m) => m.pct < 0);

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
  const cheapestPrice = new Map<string, { price: number; label: string }>();
  for (const p of prices) {
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
      .map((b) => ({ modelKey: b.model_key, score: Number(b.score) }));
    if (scored.length < 2) continue;

    const scores = scored.map((s) => s.score);
    const spread = Math.max(...scores) - Math.min(...scores);
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
    newListings: history.filter((h) => h.change_kind === "new").length,
    // Genuinely new models only — a backfilled catalogue reads 0 here until one lands.
    newModels: models.filter((m) => new Date(m.first_seen_at) >= monthStart).length,
    topIncreases: [...increases].sort((a, b) => b.pct - a.pct).slice(0, 5),
    topDecreases: [...decreases].sort((a, b) => a.pct - b.pct).slice(0, 5),
    repricers,
    spreads: spreads.slice(0, 8),
    multiHostModels: hostCounts.filter((c) => c > 1).length,
    medianHostsPerModel: hostCounts.length ? hostCounts[Math.floor(hostCounts.length / 2)] : 0,
    maxHostsPerModel: hostCounts.length ? hostCounts[hostCounts.length - 1] : 0,
    bandWinners,
    saturation,
  };
}
