/**
 * Multi-line estimator aggregation.
 *
 * A visitor allocates one total monthly spend across several named lines
 * (workload x provider x model x share), plus whatever they leave unallocated.
 * Each named line is priced by the EXISTING resolveEstimate, one call per line,
 * unchanged. This module only combines those answers.
 *
 * Two policies, deliberate:
 *
 * 1. The materiality floor is PER LINE. resolveEstimate already applies it
 *    (a line under MATERIALITY_USD comes back `below_threshold`), and we do not
 *    launder several sub-material lines into one material-looking total. Such a
 *    line stays visible with its own real state and contributes $0.
 * 2. Rounding happens per line, before summation. The total is the sum of the
 *    figures a visitor can see itemised, so adding up the lines by hand always
 *    matches the total.
 */

import { resolveEstimate, type EstimatorCatalog } from "./core";
import {
  DISTRIBUTIONS,
  MATERIALITY_USD,
  type EstimatorResult,
  type WorkloadId,
} from "./spec";
import { round2 } from "@/lib/engine/cost";

/**
 * resolveEstimate multiplies the spend it is given by a distribution share.
 * Multi-line allocation states the share explicitly, so we hand it the line's
 * spend pre-divided by that share and let it multiply back to exactly the
 * line's own dollars. The engine is untouched; nothing here re-implements it.
 */
const LINE_DISTRIBUTION = DISTRIBUTIONS[0]; // "dominant", share 0.7

export interface EstimatorLineInput {
  workload: WorkloadId;
  /** host_prices.host_label, or null for "not sure". */
  provider: string | null;
  /** model_catalog.model_key, or null. */
  modelKey: string | null;
  /** Whole-percent share of the total monthly spend, 0-100. */
  sharePct: number;
}

export interface EstimatorLine extends EstimatorLineInput {
  /** Exactly what resolveEstimate returns today, untouched. */
  result: EstimatorResult;
  /** The dollars this line represents, total spend x share. */
  lineSpendUsd: number;
  /** True only when the line is `ok` and clears the per-line floor itself. */
  countedInTotal: boolean;
}

export interface UnallocatedRemainder {
  sharePct: number;
  impliedSpendUsd: number;
}

export interface AggregateEstimatorResult {
  totalSpendUsd: number;
  lines: EstimatorLine[];
  /**
   * The remainder the visitor did not itemise. It never carries a saving, is
   * never certified and is never refused: nothing was measured about it.
   */
  unallocated: UnallocatedRemainder;
  /** Sum of the rounded per-line HIGH figures that clear the floor. */
  totalCertifiedSavingUsd: number;
  /** Sum of the rounded per-line LOW figures that clear the floor. */
  totalCertifiedSavingLowUsd: number;
  /** Share of total spend covered by lines that actually certified. */
  certifiedSharePct: number;
}

export function aggregateEstimate(
  catalog: EstimatorCatalog,
  input: { totalSpendUsd: number; lines: EstimatorLineInput[] },
): AggregateEstimatorResult {
  const totalSpendUsd = Math.max(0, input.totalSpendUsd);

  let allocated = 0;
  for (const line of input.lines) {
    if (!Number.isFinite(line.sharePct) || line.sharePct < 0) {
      throw new Error(`Line share must be a non-negative percentage, got ${line.sharePct}`);
    }
    allocated += line.sharePct;
  }
  if (allocated > 100) {
    throw new Error(`Allocated shares total ${allocated}%, which exceeds the monthly spend.`);
  }

  const lines: EstimatorLine[] = input.lines.map((line) => {
    const lineSpendUsd = (totalSpendUsd * line.sharePct) / 100;
    const result = resolveEstimate(catalog, {
      // Pre-divided so the engine's own share multiply lands on lineSpendUsd.
      monthlySpendUsd: lineSpendUsd / LINE_DISTRIBUTION.share,
      provider: line.provider,
      workload: line.workload,
      modelKey: line.modelKey,
      distribution: LINE_DISTRIBUTION.id,
    });

    return {
      ...line,
      lineSpendUsd: round2(lineSpendUsd),
      result,
      countedInTotal: result.state === "ok" && result.highUsd >= MATERIALITY_USD,
    };
  });

  let totalCertifiedSavingUsd = 0;
  let totalCertifiedSavingLowUsd = 0;
  let certifiedSharePct = 0;
  for (const line of lines) {
    if (!line.countedInTotal || line.result.state !== "ok") continue;
    // Per-line rounded figures, added as displayed.
    totalCertifiedSavingUsd += line.result.highUsd;
    totalCertifiedSavingLowUsd += line.result.lowUsd;
    certifiedSharePct += line.sharePct;
  }

  const unallocatedPct = 100 - allocated;

  return {
    totalSpendUsd,
    lines,
    unallocated: {
      sharePct: unallocatedPct,
      impliedSpendUsd: round2((totalSpendUsd * unallocatedPct) / 100),
    },
    totalCertifiedSavingUsd: round2(totalCertifiedSavingUsd),
    totalCertifiedSavingLowUsd: round2(totalCertifiedSavingLowUsd),
    certifiedSharePct,
  };
}
