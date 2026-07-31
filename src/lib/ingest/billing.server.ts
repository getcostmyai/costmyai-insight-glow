import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { round2 } from "@/lib/engine/cost";

import {
  captureIdempotencyKey,
  providerForHost,
  RECONCILIATION_TOLERANCE_PCT,
  type ReconciliationVerdict,
} from "./contract";
import type { BillingCapture } from "./schema";

/**
 * Billing reconciliation — estimated versus invoiced.
 *
 * The customer pushes what their provider actually charged; we already know
 * what the metadata says it should have cost. The gap is the product: cached
 * prompts, minimum billing units and rounding mean the two never match
 * exactly, and a reconciliation that always balanced would be lying.
 *
 * Captures are idempotent on (org, provider, period_start, period_end): a
 * reconnect, a retried push, or a re-run of the 30-day backfill produces
 * exactly one capture per provider-period, updated in place.
 *
 * Reconciliations are an APPEND-ONLY LEDGER. A restatement never edits or
 * deletes the earlier figure: it stamps the previous current row with
 * superseded_at and appends a new row carrying supersedes_id. If a number is
 * ever disputed, the full chain of what was claimed and when is still there.
 * "Current" means superseded_at IS NULL.
 */

function adminClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface ReconciledCapture {
  provider: string;
  periodStart: string;
  periodEnd: string;
  estimatedUsd: number;
  invoicedUsd: number;
  deltaUsd: number;
  deltaPct: number;
  verdict: ReconciliationVerdict;
  note: string;
  coverageNote?: string;
  /** True when this push restated an earlier figure (a new ledger row supersedes it). */
  restated: boolean;
  /** The reconciliation row this one supersedes, if any. */
  supersedesId: string | null;
}

export interface BillingIngestResult {
  captures: number;
  reconciled: ReconciledCapture[];
  coverageNotes: string[];
}

export function verdictFor(estimatedUsd: number, invoicedUsd: number) {
  const deltaUsd = round2(invoicedUsd - estimatedUsd);
  const deltaPct = estimatedUsd === 0 ? 0 : round2((deltaUsd / estimatedUsd) * 100);
  const verdict: ReconciliationVerdict =
    Math.abs(deltaPct) <= RECONCILIATION_TOLERANCE_PCT
      ? "match"
      : deltaUsd > 0
        ? "under_estimated"
        : "over_estimated";
  const note =
    verdict === "match"
      ? `Within the ±${RECONCILIATION_TOLERANCE_PCT}% tolerance band.`
      : verdict === "under_estimated"
        ? "Invoice above metadata estimate — typically minimum billing units or untracked retries."
        : "Invoice below metadata estimate — typically prompt caching or committed-use discounts.";
  return { deltaUsd, deltaPct, verdict, note };
}

/**
 * What the metadata says this provider's traffic cost across the period. Summed
 * from day rollups, which are themselves re-derived from raw events — the same
 * numbers the dashboard shows, never a second parallel calculation.
 */
export async function estimateForPeriod(
  orgId: string,
  provider: string,
  periodStart: string,
  periodEnd: string,
): Promise<number> {
  const db = adminClient();
  const { data, error } = await db
    .from("usage_rollups")
    .select("host, cost_usd")
    .eq("org_id", orgId)
    .eq("granularity", "day")
    .gte("bucket_start", `${periodStart}T00:00:00Z`)
    .lt("bucket_start", `${periodEnd}T00:00:00Z`)
    .limit(100_000);
  if (error) throw new Error(`estimate failed: ${error.message}`);

  let total = 0;
  for (const row of data ?? []) {
    if (providerForHost(row.host) !== provider) continue;
    total += Number(row.cost_usd);
  }
  return round2(total);
}

export async function ingestBillingCaptures(
  orgId: string,
  captures: BillingCapture[],
): Promise<BillingIngestResult> {
  const db = adminClient();
  const reconciled: ReconciledCapture[] = [];
  const coverageNotes: string[] = [];

  for (const capture of captures) {
    const provider = capture.provider.trim().toLowerCase();
    const idempotencyKey =
      capture.idempotency_key ?? captureIdempotencyKey(provider, capture.period_start, capture.period_end);

    const { data: row, error } = await db
      .from("billing_captures")
      .upsert(
        {
          org_id: orgId,
          provider,
          period_start: capture.period_start,
          period_end: capture.period_end,
          invoiced_usd: capture.invoiced_usd,
          currency: capture.currency,
          idempotency_key: idempotencyKey,
          captured_at: new Date().toISOString(),
        },
        { onConflict: "org_id,provider,period_start,period_end" },
      )
      .select("id")
      .single();
    if (error) throw new Error(`billing capture failed: ${error.message}`);

    const estimatedUsd = await estimateForPeriod(orgId, provider, capture.period_start, capture.period_end);
    const { deltaUsd, deltaPct, verdict, note } = verdictFor(estimatedUsd, capture.invoiced_usd);

    // Append-only ledger: find the current row, and only restate if the figures
    // actually moved. An identical re-push is a no-op, not ledger noise.
    const { data: current } = await db
      .from("billing_reconciliations")
      .select("id, estimated_usd, invoiced_usd, verdict, note")
      .eq("capture_id", row.id)
      .is("superseded_at", null)
      .order("computed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const finalNote = capture.coverage_note ? `${note} ${capture.coverage_note}` : note;
    const unchanged =
      current !== null &&
      Number(current.estimated_usd) === estimatedUsd &&
      Number(current.invoiced_usd) === capture.invoiced_usd &&
      current.verdict === verdict &&
      current.note === finalNote;

    let supersedesId: string | null = null;
    if (!unchanged) {
      if (current) {
        // Stamp, never edit the figures themselves.
        const { error: stampError } = await db
          .from("billing_reconciliations")
          .update({ superseded_at: new Date().toISOString() })
          .eq("id", current.id)
          .is("superseded_at", null);
        if (stampError) throw new Error(`supersede failed: ${stampError.message}`);
        supersedesId = current.id;
      }
      const { error: reconError } = await db.from("billing_reconciliations").insert({
        org_id: orgId,
        capture_id: row.id,
        estimated_usd: estimatedUsd,
        invoiced_usd: capture.invoiced_usd,
        delta_usd: deltaUsd,
        delta_pct: deltaPct,
        verdict,
        note: finalNote,
        supersedes_id: supersedesId,
        computed_at: new Date().toISOString(),
      });
      if (reconError) throw new Error(`reconciliation failed: ${reconError.message}`);
    }

    if (capture.coverage_note) coverageNotes.push(capture.coverage_note);

    reconciled.push({
      provider,
      periodStart: capture.period_start,
      periodEnd: capture.period_end,
      estimatedUsd,
      invoicedUsd: capture.invoiced_usd,
      deltaUsd,
      deltaPct,
      verdict,
      note,
      coverageNote: capture.coverage_note,
      restated: !unchanged && supersedesId !== null,
      supersedesId,
    });
  }

  return { captures: reconciled.length, reconciled, coverageNotes };
}
