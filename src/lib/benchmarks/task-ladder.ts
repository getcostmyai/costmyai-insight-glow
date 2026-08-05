/**
 * The certifiable task ladder.
 *
 * Every product task type maps to a RANKED list of Artificial Analysis
 * evaluations, ordered by how appropriate the instrument is for that kind of
 * work — not by which instrument currently happens to separate models best.
 * At decision time we walk that list in order and take the FIRST rung whose
 * measured separation clears SEPARATION_THRESHOLD. If no rung clears it, the
 * answer is REFUSE. There is no composite fallback: a blended index has no
 * published item count, so it can carry no honest margin and can never stand in
 * for a real instrument.
 *
 * Pure module — no network, no database — so the walk is unit-testable and the
 * refusal path can be proven rather than described.
 */

/** Points of spread (0-100 scale) an instrument must show to certify anything. */
export const SEPARATION_THRESHOLD = 10.0;

/** The AA fields we ingest and separation-score. Names are AA's current ones. */
export const AA_FIELDS = [
  "terminalbench_v2_1",
  "scicode",
  "hle",
  "gpqa",
  "tau_banking",
  "lcr",
] as const;

export type AaField = (typeof AA_FIELDS)[number];

export interface FieldSpec {
  field: AaField;
  label: string;
  /** Published item count of the evaluation set — what makes the margin measured. */
  sampleSize: number;
}

export const FIELD_SPECS: Record<AaField, FieldSpec> = {
  terminalbench_v2_1: { field: "terminalbench_v2_1", label: "Terminal-Bench v2.1", sampleSize: 89 },
  scicode: { field: "scicode", label: "SciCode", sampleSize: 338 },
  hle: { field: "hle", label: "Humanity's Last Exam", sampleSize: 2500 },
  gpqa: { field: "gpqa", label: "GPQA Diamond", sampleSize: 198 },
  tau_banking: { field: "tau_banking", label: "\u03C4\u00B3-Banking", sampleSize: 97 },
  lcr: { field: "lcr", label: "AA Long Context Reasoning", sampleSize: 100 },
};

/** Product-facing task types, as a customer's workload is labelled. */
export const PRODUCT_TASKS = [
  "coding",
  "debugging",
  "data_analysis",
  "reasoning",
  "question_answering",
  "planning",
  "decision_support",
  "agent_execution",
  "classification",
  "extraction",
  "generation",
  "summarization",
  "rewriting",
  "retrieval",
  "conversation",
  "translation",
  "prediction",
  "recommendation",
  "monitoring",
  "simulation",
] as const;

export type ProductTask = (typeof PRODUCT_TASKS)[number];

/**
 * Ranked candidates per product task. An empty list means the category is
 * explicitly unsupported today: no current AA evaluation measures it, so it
 * REFUSES unconditionally rather than borrowing an unrelated instrument.
 */
export const TASK_LADDERS: Record<ProductTask, AaField[]> = {
  coding: ["terminalbench_v2_1", "scicode"],
  debugging: ["terminalbench_v2_1", "scicode"],
  data_analysis: ["terminalbench_v2_1", "scicode"],

  reasoning: ["hle", "gpqa"],
  question_answering: ["hle", "gpqa"],

  planning: ["tau_banking"],
  decision_support: ["tau_banking"],
  agent_execution: ["tau_banking"],

  classification: ["lcr"],
  extraction: ["lcr"],
  generation: ["lcr"],
  summarization: ["lcr"],
  rewriting: ["lcr"],
  retrieval: ["lcr"],
  conversation: ["lcr"],

  translation: [],
  prediction: [],
  recommendation: [],
  monitoring: [],
  simulation: [],
};

/** Legacy/shorthand workload labels used elsewhere in the product. */
const TASK_ALIASES: Record<string, ProductTask> = {
  code: "coding",
  classify: "classification",
  extract: "extraction",
  generate: "generation",
  chat: "conversation",
  rag: "retrieval",
  agentic: "agent_execution",
  reason: "reasoning",
  qa: "question_answering",
};

/**
 * The label real gateway traffic carries when nothing structural identified the
 * work (Dispatch 99). It is not a task and never resolves to one: an unlabelled
 * cohort refuses, with copy that says why, instead of being quietly folded into
 * `generation` and certified against an instrument that measures other work.
 */
export const UNLABELLED_TASK = "unknown";

export function normalizeTask(task: string): ProductTask | null {
  const key = task.trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  if (key === UNLABELLED_TASK) return null;
  if ((PRODUCT_TASKS as readonly string[]).includes(key)) return key as ProductTask;
  return TASK_ALIASES[key] ?? null;
}


/**
 * Walk the ranked candidates for `task` and return the index of the first rung
 * whose separation clears the threshold, or -1 to REFUSE.
 */
export function walkLadder(task: string, separationOf: (field: AaField) => number | null): number {
  const normalized = normalizeTask(task);
  if (!normalized) return -1;
  const ladder = TASK_LADDERS[normalized];
  for (let i = 0; i < ladder.length; i++) {
    const separation = separationOf(ladder[i]);
    if (separation != null && separation >= SEPARATION_THRESHOLD) return i;
  }
  return -1;
}

export type LadderRefusal = "no_valid_instrument" | "benchmark_not_discriminating";

export interface LadderResolution {
  /** The chosen instrument, or null when the walk refused. */
  field: AaField | null;
  /** Index of the passing rung, -1 on refusal. */
  rung: number;
  /** Every rung considered, with the separation it showed. */
  tried: { field: AaField; separation: number | null; passed: boolean }[];
  refusal: LadderRefusal | null;
  detail: string;
}

/** The walk plus the reason it ended the way it did, for honest UI copy. */
export function resolveLadder(
  task: string,
  separationOf: (field: AaField) => number | null,
): LadderResolution {
  const normalized = normalizeTask(task);
  if (!normalized || TASK_LADDERS[normalized].length === 0) {
    return {
      field: null,
      rung: -1,
      tried: [],
      refusal: "no_valid_instrument",
      detail: `No independent evaluation currently measures ${task.replaceAll("_", " ")} work, so no switch on it can be certified.`,
    };
  }

  const tried = TASK_LADDERS[normalized].map((field) => {
    const separation = separationOf(field);
    return {
      field,
      separation,
      passed: separation != null && separation >= SEPARATION_THRESHOLD,
    };
  });

  const hit = tried.findIndex((t) => t.passed);
  if (hit === -1) {
    return {
      field: null,
      rung: -1,
      tried,
      refusal: "benchmark_not_discriminating",
      detail: `No model currently differentiates enough on ${task.replaceAll("_", " ")} to certify a switch (${tried
        .map((t) => `${FIELD_SPECS[t.field].label} ${t.separation == null ? "unscored" : t.separation.toFixed(1)}`)
        .join(", ")}; threshold ${SEPARATION_THRESHOLD.toFixed(1)}).`,
    };
  }

  return {
    field: tried[hit].field,
    rung: hit,
    tried,
    refusal: null,
    detail: `${FIELD_SPECS[tried[hit].field].label} separates by ${tried[hit].separation?.toFixed(1)} points on ${task.replaceAll("_", " ")}.`,
  };
}

/** Separation = observed spread of scores on one instrument, in points. */
export function separationOfScores(scores: number[]): number | null {
  if (scores.length < 2) return null;
  return Math.max(...scores) - Math.min(...scores);
}
