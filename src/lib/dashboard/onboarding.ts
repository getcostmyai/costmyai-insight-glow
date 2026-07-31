import type { RecKind } from "../engine/types";

/**
 * Two different silences.
 *
 * "Nothing to save" means the pipeline ran over real traffic and found the
 * workspace already optimal — a result. "No data yet" means there is nothing to
 * run over — a setup step. They must never share a sentence.
 */

export type DataState = "awaiting_first_event" | "warming_up" | "ready";

export function deriveDataState(input: {
  hasEverIngested: boolean;
  rowsInWindow: number;
}): DataState {
  if (!input.hasEverIngested) return "awaiting_first_event";
  if (input.rowsInWindow === 0) return "warming_up";
  return "ready";
}

export interface EmptyCopy {
  title: string;
  body: string;
  tone: "good" | "waiting";
}

const RESULT_COPY: Record<RecKind, EmptyCopy> = {
  host_arbitrage: {
    title: "Every workload is already on its cheapest verified host",
    body: "The arbitrage check ran across this window and found no provider that is cheaper for the same model weights.",
    tone: "good",
  },
  quality_match: {
    title: "No cheaper model cleared the measured quality bar",
    body: "Candidates were evaluated against your own task classes and refused rather than guessed at.",
    tone: "good",
  },
  rightsize: {
    title: "No workload is running on more model than it needs",
    body: "Output-length shape and task complexity both sit inside the tier you are already paying for.",
    tone: "good",
  },
};

export function emptyCopy(state: DataState, kind: RecKind): EmptyCopy {
  if (state === "awaiting_first_event") {
    return {
      title: "Waiting for your first event",
      body: "Point your gateway at CostMyAI and this check starts the moment the first request lands. We backfill the previous 30 days on connect, so it will not start empty for long.",
      tone: "waiting",
    };
  }
  if (state === "warming_up") {
    return {
      title: "No traffic in this window yet",
      body: "This workspace has history, but nothing was routed inside the selected period. Widen the range to see earlier findings.",
      tone: "waiting",
    };
  }
  return RESULT_COPY[kind];
}
