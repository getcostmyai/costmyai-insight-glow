/**
 * Mapping and statistics for the Artificial Analysis benchmark sync.
 *
 * Pure module — no network, no credentials — so the maths below is unit-testable
 * and the margins the engine relies on can be verified independently of the feed.
 */

export const AA_SUITE = "aa";

/**
 * Our catalogue key -> the AA slug, only where the two genuinely differ.
 * Anything not listed here must match by slug exactly; we never fuzzy-match a
 * model name, because silently benchmarking against the wrong variant
 * (reasoning vs non-reasoning, pro vs mini) is worse than having no score.
 */
export const AA_SLUG_ALIASES: Record<string, string> = {
  "gpt-5.4": "gpt-5-4",
  "gpt-5.5": "gpt-5-5",
  "claude-opus-4-7-fast": "claude-opus-4-7-non-reasoning",
  "llama-3.3-70b-instruct": "llama-3-3-instruct-70b",
  "qwen3-32b": "qwen3-32b-instruct",
};

/**
 * Which AA evaluation stands in for each workload task class, plus the published
 * item count of that evaluation. The item count is what makes the margin a
 * measured quantity rather than a guess — see marginFor().
 */
export interface EvalSpec {
  /** Key inside AA's `evaluations` object. */
  field: string;
  /** Number of scored items in the published evaluation set. */
  sampleSize: number;
  label: string;
}

/**
 * Candidate evaluations per task class, in preference order. Only evaluations
 * with a published, fixed item count appear here — without `n` there is no
 * honest margin, and a task class with no usable evaluation simply goes
 * unscored rather than being scored against something unmeasurable.
 */
export const TASK_EVAL_CANDIDATES: Record<string, EvalSpec[]> = {
  generation: [
    { field: "mmlu_pro", sampleSize: 12032, label: "MMLU-Pro" },
    { field: "gpqa", sampleSize: 198, label: "GPQA Diamond" },
    { field: "hle", sampleSize: 2500, label: "Humanity's Last Exam" },
  ],
  code: [
    { field: "livecodebench", sampleSize: 1055, label: "LiveCodeBench" },
    { field: "scicode", sampleSize: 338, label: "SciCode" },
    { field: "terminalbench_hard", sampleSize: 89, label: "Terminal-Bench Hard" },
  ],
  classification: [
    { field: "ifbench", sampleSize: 294, label: "IFBench" },
    { field: "tau2", sampleSize: 285, label: "tau2-bench" },
  ],
};

/**
 * A task class must be scored on ONE evaluation for every model, or the scores
 * are not comparable and no equivalence claim holds. Pick the first candidate
 * that covers at least this share of the catalogue; if none does, the
 * best-covered candidate wins, ties broken by preference order.
 */
export const COVERAGE_TARGET = 0.8;

export function chooseEval(
  candidates: EvalSpec[],
  coverageOf: (spec: EvalSpec) => number,
  catalogueSize: number,
): { spec: EvalSpec; covered: number } | null {
  if (catalogueSize === 0) return null;
  const scored = candidates.map((spec) => ({ spec, covered: coverageOf(spec) }));
  const clearing = scored.find((c) => c.covered / catalogueSize >= COVERAGE_TARGET);
  if (clearing) return clearing;
  const best = scored.reduce((a, b) => (b.covered > a.covered ? b : a), scored[0]);
  return best && best.covered > 1 ? best : null;
}


/**
 * Composite indices (artificial_analysis_*_index) are deliberately NOT used.
 * They are weighted blends with no published item count, so no honest
 * measurement margin can be derived for them and Clause 04 cannot be enforced.
 */
export const EXCLUDED_FIELDS = [
  "artificial_analysis_intelligence_index",
  "artificial_analysis_coding_index",
  "artificial_analysis_math_index",
];

export interface AaModel {
  slug: string;
  name: string;
  evaluations: Record<string, number | null>;
  median_time_to_first_answer_token?: number | null;
}

export interface ScoreRow {
  model_key: string;
  suite: string;
  task_class: string;
  score: number;
  sample_size: number;
  source: string;
}

/** AA reports accuracies as 0-1 fractions; we store 0-100 points throughout. */
export function toPoints(fraction: number): number {
  return Math.round(fraction * 100 * 1000) / 1000;
}

/**
 * The measured Clause 04 equivalence boundary.
 *
 * Two models are indistinguishable when the gap between their scores is smaller
 * than the evaluation can resolve. For an accuracy measured over `n` scored
 * items, the 95% Wald half-width at the observed rate is exactly that
 * resolution — a real statistic derived from the real published sample size,
 * never a hardcoded tolerance.
 */
export function marginFor(scoresInPoints: number[], sampleSize: number): number {
  if (scoresInPoints.length === 0 || sampleSize <= 0) return Number.NaN;
  const mean = scoresInPoints.reduce((a, b) => a + b, 0) / scoresInPoints.length / 100;
  const p = Math.min(Math.max(mean, 0), 1);
  const halfWidth = 1.96 * Math.sqrt((p * (1 - p)) / sampleSize);
  return Math.round(halfWidth * 100 * 1000) / 1000;
}

export const MARGIN_METHOD = "binomial_wald_95";

export interface TransformResult {
  scores: ScoreRow[];
  margins: { suite: string; task_class: string; margin: number; method: string }[];
  matchedModels: string[];
  unmatchedModels: string[];
  skipped: { model_key: string; task_class: string; reason: string }[];
}

/**
 * Turns a raw AA payload plus our catalogue into rows ready for upsert.
 * A model with no score for a task class is left out entirely — the engine's
 * fail-closed path is the correct outcome there, not an imputed number.
 */
export function transformAaPayload(models: AaModel[], catalogKeys: string[]): TransformResult {
  const bySlug = new Map(models.map((m) => [m.slug, m]));
  const scores: ScoreRow[] = [];
  const matchedModels: string[] = [];
  const unmatchedModels: string[] = [];
  const skipped: TransformResult["skipped"] = [];

  for (const key of catalogKeys) {
    const slug = AA_SLUG_ALIASES[key] ?? key;
    const model = bySlug.get(slug);
    if (!model) {
      unmatchedModels.push(key);
      continue;
    }
    matchedModels.push(key);

    for (const [taskClass, spec] of Object.entries(TASK_EVALS)) {
      const raw = model.evaluations?.[spec.field];
      if (raw == null || Number.isNaN(Number(raw))) {
        skipped.push({
          model_key: key,
          task_class: taskClass,
          reason: `${spec.label} not reported for ${slug}`,
        });
        continue;
      }
      scores.push({
        model_key: key,
        suite: AA_SUITE,
        task_class: taskClass,
        score: toPoints(Number(raw)),
        sample_size: spec.sampleSize,
        source: `artificialanalysis.ai/${slug}#${spec.field}`,
      });
    }
  }

  const margins = Object.entries(TASK_EVALS)
    .map(([taskClass, spec]) => {
      const rows = scores.filter((s) => s.task_class === taskClass);
      const margin = marginFor(
        rows.map((r) => r.score),
        spec.sampleSize,
      );
      return { suite: AA_SUITE, task_class: taskClass, margin, method: MARGIN_METHOD };
    })
    .filter((m) => Number.isFinite(m.margin));

  return { scores, margins, matchedModels, unmatchedModels, skipped };
}
