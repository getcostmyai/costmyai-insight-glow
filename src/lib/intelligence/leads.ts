/**
 * The lead detector (Dispatch 144, Phase 2).
 *
 * Six detectors, all pure: they take rows and return leads. Nothing here
 * reads the database, so every threshold can be proven against a fixture and
 * the two detectors that cannot fire on today's history can still be proven
 * to fire on the history they are waiting for.
 *
 * A lead is NOT a claim. It is a pointer at something worth a human look, and
 * every lead carries the evidence that produced it so the editorial step can
 * label it "proven mechanism", "correlated, not proven causal" or
 * "third-party sourced" — never inherit a label from a threshold.
 */

import { separationOfScores } from "@/lib/benchmarks/task-ladder";

export const DETECTORS = [
  "price_move",
  "provider_spread",
  "benchmark_saturation",
  "listing_cluster",
  "score_drift",
  "flat_price_rising_quality",
] as const;

export type DetectorId = (typeof DETECTORS)[number];

export const DETECTOR_LABELS: Record<DetectorId, string> = {
  price_move: "Outsized price move",
  provider_spread: "Provider spread on identical weights",
  benchmark_saturation: "Benchmark saturation",
  listing_cluster: "Cluster of new listings",
  score_drift: "Silent model drift",
  flat_price_rising_quality: "Silent price cut",
};

export interface Lead {
  detector: DetectorId;
  /** Stable identity of the thing observed, so a repeat run refreshes one row. */
  dedupeKey: string;
  severity: "watch" | "note";
  title: string;
  summary: string;
  evidence: Record<string, unknown>;
}

/** Why a detector produced nothing, stated honestly rather than as silence. */
export interface DetectorOutcome {
  detector: DetectorId;
  leads: number;
  /** "fired", "quiet" (data present, nothing crossed), or "insufficient_history". */
  state: "fired" | "quiet" | "insufficient_history";
  detail: string;
}

const DAY_MS = 86_400_000;
const round = (n: number, dp = 2) => Number(n.toFixed(dp));
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  if (s.length === 0) return 0;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

/* ------------------------------------------------------------------ 1 */

export interface PriceMoveRow {
  model_key: string;
  host: string;
  pct_change: number | null;
  change_kind: string;
  observed_at: string;
}

/** A move is outsized against the model's OWN tracked history, not a fixed bar. */
export const PRICE_MOVE = {
  /** Nothing under this is interesting however unusual it is for the model. */
  minAbsPct: 25,
  /** Multiple of the model's own median absolute move that counts as outsized. */
  multiple: 3,
  /** With no history to compare against, only a very large move qualifies. */
  minHistory: 3,
  loneMoveMinAbsPct: 100,
  windowDays: 7,
};

export function detectPriceMoves(rows: PriceMoveRow[], nowMs: number): Lead[] {
  const byModel = new Map<string, PriceMoveRow[]>();
  for (const r of rows) {
    if (r.pct_change == null) continue;
    byModel.set(r.model_key, [...(byModel.get(r.model_key) ?? []), r]);
  }

  const leads: Lead[] = [];
  for (const [modelKey, moves] of byModel) {
    const recent = moves.filter(
      (m) => nowMs - Date.parse(m.observed_at) <= PRICE_MOVE.windowDays * DAY_MS,
    );
    if (recent.length === 0) continue;

    const biggest = recent.reduce((a, b) =>
      Math.abs(Number(b.pct_change)) > Math.abs(Number(a.pct_change)) ? b : a,
    );
    const abs = Math.abs(Number(biggest.pct_change));
    if (abs < PRICE_MOVE.minAbsPct) continue;

    // The model's own baseline: every earlier move it has ever recorded.
    const history = moves
      .filter((m) => Date.parse(m.observed_at) < Date.parse(biggest.observed_at))
      .map((m) => Math.abs(Number(m.pct_change)));
    const typical = median(history);

    if (history.length < PRICE_MOVE.minHistory) {
      if (abs < PRICE_MOVE.loneMoveMinAbsPct) continue;
    } else if (!(abs >= typical * PRICE_MOVE.multiple)) {
      continue;
    }

    const direction = Number(biggest.pct_change) < 0 ? "cut" : "rise";
    leads.push({
      detector: "price_move",
      dedupeKey: `${modelKey}::${biggest.host}::${biggest.observed_at}`,
      severity: abs >= 100 ? "note" : "watch",
      title: `${modelKey} moved ${round(Number(biggest.pct_change), 1)}% on ${biggest.host}`,
      summary:
        history.length >= PRICE_MOVE.minHistory
          ? `A ${round(abs, 1)}% ${direction} against a typical tracked move of ${round(typical, 1)}% for this model.`
          : `A ${round(abs, 1)}% ${direction} with only ${history.length} earlier tracked move${history.length === 1 ? "" : "s"} to compare against.`,
      evidence: {
        modelKey,
        host: biggest.host,
        pctChange: round(Number(biggest.pct_change), 3),
        changeKind: biggest.change_kind,
        observedAt: biggest.observed_at,
        typicalAbsPct: round(typical, 3),
        priorMoves: history.length,
      },
    });
  }
  return leads;
}

/* ------------------------------------------------------------------ 2 */

export interface SpreadPriceRow {
  model_key: string;
  host_label: string;
  input_usd_per_mtok: number;
  output_usd_per_mtok: number;
}

export const PROVIDER_SPREAD = { minProviders: 3, minRatio: 5 };

/** Identical weights, different asking price. Aggregate listings excluded upstream. */
export function detectProviderSpreads(prices: SpreadPriceRow[]): Lead[] {
  const byModel = new Map<string, SpreadPriceRow[]>();
  for (const p of prices) {
    if (!(Number(p.input_usd_per_mtok) > 0)) continue;
    byModel.set(p.model_key, [...(byModel.get(p.model_key) ?? []), p]);
  }

  const leads: Lead[] = [];
  for (const [modelKey, rows] of byModel) {
    if (rows.length < PROVIDER_SPREAD.minProviders) continue;
    const sorted = [...rows].sort(
      (a, b) => Number(a.input_usd_per_mtok) - Number(b.input_usd_per_mtok),
    );
    const cheap = sorted[0]!;
    const dear = sorted[sorted.length - 1]!;
    const ratio = Number(dear.input_usd_per_mtok) / Number(cheap.input_usd_per_mtok);
    if (ratio < PROVIDER_SPREAD.minRatio) continue;

    leads.push({
      detector: "provider_spread",
      dedupeKey: modelKey,
      severity: ratio >= 10 ? "note" : "watch",
      title: `${modelKey} costs ${round(ratio, 1)}x more on ${dear.host_label} than on ${cheap.host_label}`,
      summary: `${rows.length} providers serve the same weights between $${round(Number(cheap.input_usd_per_mtok), 3)} and $${round(Number(dear.input_usd_per_mtok), 3)} per million input tokens.`,
      evidence: {
        modelKey,
        providers: rows.length,
        ratio: round(ratio, 3),
        cheapest: { host: cheap.host_label, input: Number(cheap.input_usd_per_mtok) },
        dearest: { host: dear.host_label, input: Number(dear.input_usd_per_mtok) },
        all: sorted.map((r) => ({ host: r.host_label, input: Number(r.input_usd_per_mtok) })),
      },
    });
  }
  return leads;
}

/* ------------------------------------------------------------------ 3 */

export interface ScoreRow {
  model_key: string;
  suite: string;
  task_class: string;
  score: number;
  measured_at?: string;
  source_run_id?: string | null;
}

export interface MarginInput {
  suite: string;
  task_class: string;
  margin: number;
}

/**
 * Saturation is not a narrow spread — it is a crowded TOP. An instrument stops
 * discriminating when the leaders are all inside one measurement margin of
 * each other, however far the tail below them stretches.
 */
export const SATURATION = { minTied: 10, minShare: 0.15 };

export function detectSaturation(scores: ScoreRow[], margins: MarginInput[]): Lead[] {
  const leads: Lead[] = [];
  for (const m of margins) {
    const measured = scores.filter(
      (s) => s.suite === m.suite && s.task_class === m.task_class && Number(s.score) > 0,
    );
    if (measured.length < 2) continue;
    const values = measured.map((s) => Number(s.score));
    const top = Math.max(...values);
    const margin = Number(m.margin);
    const tied = measured.filter((s) => Number(s.score) >= top - margin);
    const share = tied.length / measured.length;
    if (tied.length < SATURATION.minTied || share < SATURATION.minShare) continue;

    leads.push({
      detector: "benchmark_saturation",
      dedupeKey: `${m.suite}::${m.task_class}`,
      severity: share >= 0.25 ? "note" : "watch",
      title: `${m.task_class} can no longer separate its top ${tied.length} models`,
      summary: `${tied.length} of ${measured.length} measured models (${Math.round(share * 100)}%) sit within the ±${round(margin, 2)} measurement margin of the ${round(top, 2)} leader.`,
      evidence: {
        suite: m.suite,
        taskClass: m.task_class,
        margin: round(margin, 3),
        topScore: round(top, 3),
        tied: tied.length,
        measured: measured.length,
        sharePct: Math.round(share * 100),
        fullSpread: round(separationOfScores(values) ?? 0, 3),
        tiedModels: tied
          .sort((a, b) => Number(b.score) - Number(a.score))
          .slice(0, 12)
          .map((s) => ({ modelKey: s.model_key, score: Number(s.score) })),
      },
    });
  }
  return leads;
}

/* ------------------------------------------------------------------ 4 */

export interface ListingRow {
  model_key: string;
  host: string;
  host_label: string;
  first_seen_at: string;
}

export const LISTING_CLUSTER = { minListings: 8, windowDays: 30 };

/**
 * The first observed day is the catalog backfill, not an event: everything the
 * feed already carried arrives at once. It is excluded by construction, so a
 * fresh environment cannot manufacture a cluster out of its own first sync.
 */
export function detectListingClusters(rows: ListingRow[], nowMs: number): Lead[] {
  if (rows.length === 0) return [];
  const day = (iso: string) => iso.slice(0, 10);
  const backfillDay = rows
    .map((r) => day(r.first_seen_at))
    .sort()[0]!;

  const buckets = new Map<string, ListingRow[]>();
  for (const r of rows) {
    const d = day(r.first_seen_at);
    if (d === backfillDay) continue;
    if (nowMs - Date.parse(r.first_seen_at) > LISTING_CLUSTER.windowDays * DAY_MS) continue;
    const key = `${r.host}::${d}`;
    buckets.set(key, [...(buckets.get(key) ?? []), r]);
  }

  const leads: Lead[] = [];
  for (const [key, listed] of buckets) {
    if (listed.length < LISTING_CLUSTER.minListings) continue;
    const [host, d] = key.split("::") as [string, string];
    leads.push({
      detector: "listing_cluster",
      dedupeKey: key,
      severity: listed.length >= 20 ? "note" : "watch",
      title: `${listed[0]!.host_label} listed ${listed.length} new models on ${d}`,
      summary: `${listed.length} models appeared on one provider in a single day, well above the ${LISTING_CLUSTER.minListings} that counts as a cluster.`,
      evidence: {
        host,
        hostLabel: listed[0]!.host_label,
        day: d,
        count: listed.length,
        excludedBackfillDay: backfillDay,
        models: listed.slice(0, 20).map((r) => r.model_key),
      },
    });
  }
  return leads;
}

/* ------------------------------------------------------------------ 5 */

export const SCORE_DRIFT = { marginMultiple: 2 };

/**
 * The same model_key, the same instrument, two different sync runs, a score
 * gap wider than twice the measurement margin. No version string changed, so
 * either the weights behind the endpoint moved or the evaluation did — both
 * are worth an editor's attention, neither is a causal claim.
 */
export function detectScoreDrift(scores: ScoreRow[], margins: MarginInput[]): Lead[] {
  const marginOf = new Map(margins.map((m) => [`${m.suite}::${m.task_class}`, Number(m.margin)]));
  const series = new Map<string, ScoreRow[]>();
  for (const s of scores) {
    if (!(Number(s.score) > 0) || !s.measured_at) continue;
    const key = `${s.model_key}::${s.suite}::${s.task_class}`;
    series.set(key, [...(series.get(key) ?? []), s]);
  }

  const leads: Lead[] = [];
  for (const [key, rows] of series) {
    const ordered = [...rows].sort((a, b) => Date.parse(a.measured_at!) - Date.parse(b.measured_at!));
    const runs = new Set(ordered.map((r) => r.source_run_id ?? r.measured_at));
    if (ordered.length < 2 || runs.size < 2) continue;
    const before = ordered[ordered.length - 2]!;
    const after = ordered[ordered.length - 1]!;
    if ((before.source_run_id ?? "") === (after.source_run_id ?? "") && before.source_run_id) continue;

    const margin = marginOf.get(`${after.suite}::${after.task_class}`);
    if (margin == null) continue;
    const delta = Number(after.score) - Number(before.score);
    if (Math.abs(delta) <= SCORE_DRIFT.marginMultiple * margin) continue;

    leads.push({
      detector: "score_drift",
      dedupeKey: `${key}::${after.measured_at}`,
      severity: "note",
      title: `${after.model_key} moved ${round(delta, 2)} points on ${after.task_class} with no version change`,
      summary: `Scored ${round(Number(before.score), 2)} then ${round(Number(after.score), 2)} on the same instrument under the same model key — a gap of ${round(Math.abs(delta), 2)}, more than ${SCORE_DRIFT.marginMultiple}x the ±${round(margin, 2)} measurement margin.`,
      evidence: {
        modelKey: after.model_key,
        suite: after.suite,
        taskClass: after.task_class,
        margin: round(margin, 3),
        before: { score: Number(before.score), measuredAt: before.measured_at, runId: before.source_run_id ?? null },
        after: { score: Number(after.score), measuredAt: after.measured_at, runId: after.source_run_id ?? null },
        delta: round(delta, 3),
      },
    });
  }
  return leads;
}

/* ------------------------------------------------------------------ 6 */

export const FLAT_PRICE = { flatTolerancePct: 1 };

export interface PriceObservation {
  model_key: string;
  host: string;
  host_label: string;
  input_usd_per_mtok: number;
  observed_at: string;
}

/**
 * Quality up, price flat: the effective price per unit of capability fell
 * without a headline cut. Requires BOTH halves measured over the same window —
 * a flat price alone says nothing, and a score rise alone is detector 5.
 */
export function detectFlatPriceRisingQuality(
  observations: PriceObservation[],
  scores: ScoreRow[],
  margins: MarginInput[],
): Lead[] {
  const marginOf = new Map(margins.map((m) => [`${m.suite}::${m.task_class}`, Number(m.margin)]));

  const priceSeries = new Map<string, PriceObservation[]>();
  for (const o of observations) {
    priceSeries.set(o.model_key, [...(priceSeries.get(o.model_key) ?? []), o]);
  }

  const scoreSeries = new Map<string, ScoreRow[]>();
  for (const s of scores) {
    if (!(Number(s.score) > 0) || !s.measured_at) continue;
    const key = `${s.model_key}::${s.suite}::${s.task_class}`;
    scoreSeries.set(key, [...(scoreSeries.get(key) ?? []), s]);
  }

  const leads: Lead[] = [];
  for (const [key, rows] of scoreSeries) {
    const ordered = [...rows].sort((a, b) => Date.parse(a.measured_at!) - Date.parse(b.measured_at!));
    if (ordered.length < 2) continue;
    const before = ordered[0]!;
    const after = ordered[ordered.length - 1]!;
    const margin = marginOf.get(`${after.suite}::${after.task_class}`);
    if (margin == null) continue;
    const gain = Number(after.score) - Number(before.score);
    if (gain <= margin) continue;

    const prices = (priceSeries.get(after.model_key) ?? [])
      .filter(
        (p) =>
          Date.parse(p.observed_at) >= Date.parse(before.measured_at!) &&
          Date.parse(p.observed_at) <= Date.parse(after.measured_at!),
      )
      .sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at));
    if (prices.length < 2) continue;

    const first = Number(prices[0]!.input_usd_per_mtok);
    const last = Number(prices[prices.length - 1]!.input_usd_per_mtok);
    if (!(first > 0)) continue;
    const movePct = Math.abs((last - first) / first) * 100;
    if (movePct > FLAT_PRICE.flatTolerancePct) continue;

    leads.push({
      detector: "flat_price_rising_quality",
      dedupeKey: `${key}::${after.measured_at}`,
      severity: "note",
      title: `${after.model_key} got ${round(gain, 2)} points better on ${after.task_class} at the same price`,
      summary: `Price held at $${round(first, 3)} per million input tokens while the measured score rose from ${round(Number(before.score), 2)} to ${round(Number(after.score), 2)} — a real cut in price per unit of capability, with no announced price change.`,
      evidence: {
        modelKey: after.model_key,
        suite: after.suite,
        taskClass: after.task_class,
        margin: round(margin, 3),
        scoreBefore: Number(before.score),
        scoreAfter: Number(after.score),
        gain: round(gain, 3),
        priceFirst: first,
        priceLast: last,
        priceMovePct: round(movePct, 3),
        window: { from: before.measured_at, to: after.measured_at },
      },
    });
  }
  return leads;
}
