/**
 * Client-safe estimator vocabulary.
 *
 * The workload shapes below are the ONLY assumption the estimator adds on top
 * of the live catalog: a typical token mix per workload type. Everything else
 * (prices, scores, margins) is read from the same tables the certify path
 * prices against, so the estimator can never claim a switch the engine would
 * refuse.
 */

export type WorkloadId =
  | "chat"
  | "generate"
  | "coding"
  | "rag"
  | "extract"
  | "classify"
  | "agentic"
  | "reason";

export interface WorkloadShape {
  id: WorkloadId;
  label: string;
  /** Benchmark task class this workload is judged on. */
  taskClass: string;
  /** Assumed tokens per request. Stated in the methodology footnote. */
  inputTokens: number;
  outputTokens: number;
}

export const WORKLOADS: WorkloadShape[] = [
  { id: "chat", label: "Chat", taskClass: "generation", inputTokens: 1200, outputTokens: 400 },
  { id: "generate", label: "Generate", taskClass: "generation", inputTokens: 600, outputTokens: 1200 },
  { id: "coding", label: "Coding", taskClass: "code", inputTokens: 2500, outputTokens: 900 },
  { id: "rag", label: "RAG", taskClass: "generation", inputTokens: 6000, outputTokens: 500 },
  { id: "extract", label: "Extract", taskClass: "classification", inputTokens: 3000, outputTokens: 250 },
  { id: "classify", label: "Classify", taskClass: "classification", inputTokens: 900, outputTokens: 60 },
  { id: "agentic", label: "Agentic", taskClass: "code", inputTokens: 4000, outputTokens: 700 },
  { id: "reason", label: "Reason", taskClass: "generation", inputTokens: 1500, outputTokens: 2000 },
];

export type DistributionId = "dominant" | "even" | "spread";

export interface DistributionShape {
  id: DistributionId;
  label: string;
  hint: string;
  /** Share of the monthly bill this workload type plausibly represents. */
  share: number;
}

export const DISTRIBUTIONS: DistributionShape[] = [
  { id: "dominant", label: "Dominant", hint: "One workload is most of the bill", share: 0.7 },
  { id: "even", label: "Even split", hint: "A few workloads, similar size", share: 0.45 },
  { id: "spread", label: "Spread thin", hint: "Many small workloads", share: 0.25 },
];

/**
 * Conservative band. A one-time estimate off an assumed token mix should read
 * low: we quote half to four-fifths of the modelled delta, never the full one.
 */
export const CONSERVATIVE_LOW = 0.5;
export const CONSERVATIVE_HIGH = 0.8;

/** Below this, the honest answer is "not worth your afternoon". */
export const MATERIALITY_USD = 25;

export interface EstimatorInput {
  monthlySpendUsd: number;
  /** host_prices.host, or null for "not sure". */
  provider: string | null;
  workload: WorkloadId;
  /** model_catalog.model_key, optional. */
  modelKey: string | null;
  distribution: DistributionId;
}

export type EstimatorRefusal =
  | "benchmark_not_discriminating"
  | "model_not_in_catalog"
  | "shape_only"
  | "no_baseline_score"
  | "no_cheaper_equal";

export type EstimatorResult =
  | {
      state: "ok";
      lowUsd: number;
      highUsd: number;
      savingPct: number;
      fromModel: string;
      fromModelLabel: string;
      toModel: string;
      toModelLabel: string;
      toHostLabel: string;
      suite: string;
      taskClass: string;
      margin: number;
      sharePct: number;
      assumedMix: string;
    }
  | {
      state: "below_threshold";
      highUsd: number;
      /** The materiality floor the estimate failed to clear. */
      floorUsd: number;
      fromModelLabel: string;
      taskClass: string;
    }

  | {
      state: "refused";
      reason: EstimatorRefusal;
      headline: string;
      detail: string;
    };
