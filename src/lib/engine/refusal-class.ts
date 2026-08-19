import type { RefusalReason } from "./types";

/**
 * Why a workload was refused, split by whether a measurement actually happened.
 *
 * Dispatch 171 found the product asserting a measurement it never took: every
 * refusal was counted into one "refused on quality" bucket, and the tile, the
 * hero sentence and the page footer all explained that bucket as "the measured
 * quality gap fell outside the equivalence band". On a real workspace whose
 * traffic arrives without a task label, nothing was measured at all — there is
 * no instrument for an unlabelled task, so there was no band to fall outside
 * of. Counting those two facts together is a claim about evidence that does
 * not exist.
 *
 * The split lives here, next to the reasons themselves, so the copy cannot
 * drift from the engine's own verdict.
 */
export type RefusalClass =
  /** An instrument existed, the comparison ran, and the candidate failed it. */
  | "measured"
  /** No instrument, no baseline score, no price: nothing could be measured. */
  | "unmeasurable"
  /** Measurable and measured, but there was simply nothing worth switching to. */
  | "no_candidate";

const CLASS_OF: Record<RefusalReason, RefusalClass> = {
  // Nothing to measure with.
  no_baseline_price: "unmeasurable",
  no_baseline_score: "unmeasurable",
  no_valid_instrument: "unmeasurable",
  // The classifier declined, so there is no task to choose an instrument for.
  // Nothing was measured, which is the same class as having no instrument.
  task_label_low_confidence: "unmeasurable",
  /*
   * The instrument exists, but the evidence behind it is older than one sync
   * cadence, so nothing was measured recently enough to certify against. That
   * is an absent measurement, not a failed one.
   */
  benchmark_data_stale: "unmeasurable",
  // The instrument exists but cannot separate the field, so it cannot defend
  // a switch either. That is an absent measurement, not a failed one.
  benchmark_not_discriminating: "unmeasurable",
  // A real comparison ran and refused.
  no_candidate_clears_bar: "measured",
  latency_ceiling_unmet: "measured",
  // Checked, and there was nothing cheaper worth moving to.
  no_cheaper_candidate: "no_candidate",
  saving_below_floor: "no_candidate",
};

export function refusalClass(reason: RefusalReason): RefusalClass {
  return CLASS_OF[reason] ?? "unmeasurable";
}

export interface RefusalBreakdown {
  total: number;
  measured: number;
  unmeasurable: number;
  noCandidate: number;
}

export function breakdownRefusals(reasons: RefusalReason[]): RefusalBreakdown {
  const out: RefusalBreakdown = { total: reasons.length, measured: 0, unmeasurable: 0, noCandidate: 0 };
  for (const r of reasons) {
    const c = refusalClass(r);
    if (c === "measured") out.measured++;
    else if (c === "unmeasurable") out.unmeasurable++;
    else out.noCandidate++;
  }
  return out;
}
