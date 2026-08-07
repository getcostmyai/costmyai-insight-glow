/**
 * The lead detector as a standing job (Dispatch 144, Phase 2).
 *
 * Reads the ledgers, runs the six pure detectors in `leads.ts`, and upserts
 * what they found into `intelligence_leads`. A repeat run refreshes an
 * existing lead rather than duplicating it, and never resurrects one an editor
 * has already dismissed or written up.
 *
 * The run is recorded on the same `sync_runs` ledger and the same /admin/jobs
 * board as every collector, and it records a per-detector outcome — including
 * "insufficient_history" — so a detector that is quiet because the history it
 * needs does not exist yet is never mistaken for a detector that is working.
 */

import { recordRun } from "@/lib/engine/evaluate.server";
import { fetchAllRows } from "@/lib/paginate.server";
import { isRealEndpoint } from "@/lib/pricing/aggregate";

import {
  detectFlatPriceRisingQuality,
  detectListingClusters,
  detectPriceMoves,
  detectProviderSpreads,
  detectSaturation,
  detectScoreDrift,
  type DetectorId,
  type DetectorOutcome,
  type Lead,
} from "./leads";

export const LEADS_JOB = "intelligence-leads";

/** How far back the price ledger is read. Detectors window inside this. */
const HISTORY_DAYS = 90;

export interface LeadsRunResult {
  leads: number;
  written: number;
  outcomes: DetectorOutcome[];
  summary: string;
}

export async function runLeadDetectors(nowMs = Date.now()): Promise<LeadsRunResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const since = new Date(nowMs - HISTORY_DAYS * 86_400_000).toISOString();

  const [history, prices, benchmarks, margins] = await Promise.all([
    fetchAllRows((f, t) =>
      supabaseAdmin
        .from("price_history")
        .select("model_key, host, pct_change, change_kind, input_usd_per_mtok, observed_at")
        .gte("observed_at", since)
        .range(f, t),
    ),
    fetchAllRows((f, t) =>
      supabaseAdmin
        .from("host_prices")
        .select("model_key, host, host_label, price_source, input_usd_per_mtok, output_usd_per_mtok")
        .eq("is_active", true)
        .range(f, t),
    ),
    fetchAllRows((f, t) =>
      supabaseAdmin
        .from("benchmarks")
        .select("model_key, suite, task_class, score, measured_at, source_run_id")
        .range(f, t),
    ),
    fetchAllRows((f, t) =>
      supabaseAdmin.from("benchmark_margins").select("suite, task_class, margin").range(f, t),
    ),
  ]);

  const labelByHost = new Map(prices.map((p) => [String(p.host), String(p.host_label)]));
  const realPrices = prices.filter(isRealEndpoint);

  const moveRows = history
    .filter((h) => h.change_kind === "increase" || h.change_kind === "decrease")
    .map((h) => ({
      model_key: String(h.model_key),
      host: String(h.host),
      pct_change: h.pct_change == null ? null : Number(h.pct_change),
      change_kind: String(h.change_kind),
      observed_at: String(h.observed_at),
    }));

  const listingRows = history
    .filter((h) => h.change_kind === "new")
    .map((h) => ({
      model_key: String(h.model_key),
      host: String(h.host),
      host_label: labelByHost.get(String(h.host)) ?? String(h.host),
      first_seen_at: String(h.observed_at),
    }));

  const priceObservations = history
    .filter((h) => h.input_usd_per_mtok != null)
    .map((h) => ({
      model_key: String(h.model_key),
      host: String(h.host),
      host_label: labelByHost.get(String(h.host)) ?? String(h.host),
      input_usd_per_mtok: Number(h.input_usd_per_mtok),
      observed_at: String(h.observed_at),
    }));

  const scoreRows = benchmarks.map((b) => ({
    model_key: String(b.model_key),
    suite: String(b.suite),
    task_class: String(b.task_class),
    score: Number(b.score),
    measured_at: b.measured_at ? String(b.measured_at) : undefined,
    source_run_id: b.source_run_id ? String(b.source_run_id) : null,
  }));

  const marginRows = margins.map((m) => ({
    suite: String(m.suite),
    task_class: String(m.task_class),
    margin: Number(m.margin),
  }));

  const spreadRows = realPrices.map((p) => ({
    model_key: String(p.model_key),
    host_label: String(p.host_label),
    input_usd_per_mtok: Number(p.input_usd_per_mtok),
    output_usd_per_mtok: Number(p.output_usd_per_mtok),
  }));

  /** How many distinct sync runs an instrument has been measured across. */
  const runsPerSeries = new Map<string, Set<string>>();
  for (const s of scoreRows) {
    const key = `${s.model_key}::${s.suite}::${s.task_class}`;
    const set = runsPerSeries.get(key) ?? new Set<string>();
    set.add(s.source_run_id ?? s.measured_at ?? "");
    runsPerSeries.set(key, set);
  }
  const repeatedSeries = [...runsPerSeries.values()].filter((s) => s.size > 1).length;

  const results: { detector: DetectorId; leads: Lead[]; outcome: DetectorOutcome }[] = [];

  const record = (
    detector: DetectorId,
    leads: Lead[],
    quietDetail: string,
    insufficient?: string,
  ) => {
    const outcome: DetectorOutcome = leads.length
      ? { detector, leads: leads.length, state: "fired", detail: `${leads.length} lead(s).` }
      : insufficient
        ? { detector, leads: 0, state: "insufficient_history", detail: insufficient }
        : { detector, leads: 0, state: "quiet", detail: quietDetail };
    results.push({ detector, leads, outcome });
  };

  record(
    "price_move",
    detectPriceMoves(moveRows, nowMs),
    `${moveRows.length} tracked moves, none outsized against their own model's history.`,
    moveRows.length === 0 ? "No price moves recorded yet." : undefined,
  );
  record(
    "provider_spread",
    detectProviderSpreads(spreadRows),
    `${spreadRows.length} real endpoints, no model priced far enough apart across providers.`,
    spreadRows.length === 0 ? "No active real-endpoint prices." : undefined,
  );
  record(
    "benchmark_saturation",
    detectSaturation(scoreRows, marginRows),
    `${marginRows.length} instruments with a measured margin, none with a crowded top band.`,
    marginRows.length === 0 ? "No measured margins published yet." : undefined,
  );
  record(
    "listing_cluster",
    detectListingClusters(listingRows, nowMs),
    `${listingRows.length} listings tracked, none clustering on one provider in a day.`,
    listingRows.length === 0 ? "No listing history yet." : undefined,
  );
  record(
    "score_drift",
    detectScoreDrift(scoreRows, marginRows),
    `${repeatedSeries} model/instrument pairs measured more than once, none drifted past the margin.`,
    repeatedSeries === 0
      ? "No model/instrument pair has been measured across two sync runs yet, so drift cannot be observed."
      : undefined,
  );
  record(
    "flat_price_rising_quality",
    detectFlatPriceRisingQuality(priceObservations, scoreRows, marginRows),
    `${repeatedSeries} repeat-measured pairs, none rose in quality while its price held.`,
    repeatedSeries === 0
      ? "Needs the same model measured twice with a price series spanning both measurements; no pair qualifies yet."
      : undefined,
  );

  const leads = results.flatMap((r) => r.leads);
  const written = await upsertLeads(leads);

  return {
    leads: leads.length,
    written,
    outcomes: results.map((r) => r.outcome),
    summary: results
      .map((r) => `${r.detector}: ${r.outcome.state}${r.leads.length ? ` (${r.leads.length})` : ""}`)
      .join(", "),
  };
}

/**
 * Upsert on (detector, dedupe_key). An editor's verdict wins: a lead already
 * dismissed or written stays where it is, and only its evidence is refreshed.
 */
async function upsertLeads(leads: Lead[]): Promise<number> {
  if (leads.length === 0) return 0;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const nowIso = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("intelligence_leads")
    .upsert(
      leads.map((l) => ({
        detector: l.detector,
        dedupe_key: l.dedupeKey,
        severity: l.severity,
        title: l.title,
        summary: l.summary,
        evidence: l.evidence as never,
        last_seen_at: nowIso,
      })) as never,
      { onConflict: "detector,dedupe_key", ignoreDuplicates: false },
    )
    .select("id");
  if (error) throw error;
  // Dispatch 91: a write is only real when the rows come back.
  return (data ?? []).length;
}

/** Run the detectors and record the run on the ledger the jobs board reads. */
export async function runAndRecordLeadDetectors(): Promise<LeadsRunResult> {
  const started = new Date();
  try {
    const result = await runLeadDetectors(started.getTime());
    await recordRun({
      job: LEADS_JOB,
      started,
      // Quiet is a legitimate answer here: no lead is not a failed run.
      outcome: result.written > 0 ? "ok" : "quiet",
      rowsWritten: result.written,
      detail: result as unknown as Record<string, unknown>,
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordRun({ job: LEADS_JOB, started, outcome: "failed", rowsWritten: 0, error: message });
    throw err;
  }
}
