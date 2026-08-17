import { findHostArbitrage } from "./arbitrage";
import { findQualityMatches } from "./equivalence";
import { objectiveResolver, type ObjectiveRow } from "./objectives";
import { breakdownRefusals } from "./refusal-class";

import { findOversized } from "./rightsize";
import type {
  BenchmarkRow,
  MarginRow,
  ModelRow,
  PriceRow,
  Recommendation,
  Refusal,
  UsageAggregate,
} from "./types";

export interface EngineInput {
  usage: UsageAggregate[];
  prices: PriceRow[];
  benchmarks: BenchmarkRow[];
  margins: MarginRow[];
  models: ModelRow[];
  objectives?: ObjectiveRow[];
  /**
   * Non-null when the benchmark feed's last successful sync is older than one
   * cadence — certification then refuses instead of certifying against
   * evidence we cannot date.
   */
  staleEvidence?: { lastSyncedAt: string | null } | null;
}

export interface EngineOutput {
  hostArbitrage: Recommendation[];
  qualityMatched: Recommendation[];
  oversized: Recommendation[];
  refusals: Refusal[];
  stats: {
    workloads: number;
    hostCertified: number;
    qualityEvaluated: number;
    qualityCertified: number;
    qualityRefused: number;
    /** Refused after a real comparison against an instrument. */
    qualityRefusedMeasured: number;
    /** Refused because nothing could be measured: no instrument, score or price. */
    qualityRefusedUnmeasurable: number;
    /** Measured, but nothing cheaper was worth switching to. */
    qualityRefusedNoCandidate: number;
    /**
     * Workloads a certification verdict could actually be reached on. The
     * denominator of the certification rate: an unlabelled workload was never
     * a candidate, so counting it as a failed certification is a false claim.
     */
    qualityCertifiable: number;
    oversizedFlagged: number;
  };
}


/**
 * The pipeline, in the order the product runs it:
 *   arbitrage → equivalence → rightsize → (Govern decides autonomy separately)
 *
 * Rightsize runs for every workspace regardless of plan; gating happens at the
 * presentation layer so lower plans can be shown a real, non-fabricated teaser.
 */
export function runPipeline(input: EngineInput): EngineOutput {
  const resolve = objectiveResolver(input.objectives ?? []);

  const hostArbitrage = findHostArbitrage(input.usage, input.prices);
  const { recommendations: qualityMatched, refusals } = findQualityMatches(
    input.usage,
    input.prices,
    input.benchmarks,
    input.margins,
    resolve,
    input.staleEvidence ?? null,
  );
  const oversized = findOversized(input.usage, input.models, input.prices);

  // Split the refusals by whether a measurement actually happened, so no
  // surface can describe an absent instrument as a failed quality test.
  const refusalMix = breakdownRefusals(refusals.map((r) => r.reason));

  return {
    hostArbitrage,
    qualityMatched,
    oversized,
    refusals,
    stats: {
      workloads: input.usage.length,
      hostCertified: hostArbitrage.length,
      qualityEvaluated: input.usage.length,
      qualityCertified: qualityMatched.length,
      qualityRefused: refusalMix.total,
      qualityRefusedMeasured: refusalMix.measured,
      qualityRefusedUnmeasurable: refusalMix.unmeasurable,
      qualityRefusedNoCandidate: refusalMix.noCandidate,
      qualityCertifiable: Math.max(0, input.usage.length - refusalMix.unmeasurable),
      oversizedFlagged: oversized.length,
    },
  };

}

export * from "./arbitrage";
export * from "./autonomous";
export * from "./cost";
export * from "./equivalence";
export * from "./objectives";
export * from "./rightsize";
export * from "./types";
