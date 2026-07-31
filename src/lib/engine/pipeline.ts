import { findHostArbitrage } from "./arbitrage";
import { findQualityMatches } from "./equivalence";
import { objectiveResolver, type ObjectiveRow } from "./objectives";
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
  );
  const oversized = findOversized(input.usage, input.models, input.prices);

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
      qualityRefused: refusals.length,
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
