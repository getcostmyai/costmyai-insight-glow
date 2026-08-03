/**
 * Mapping and statistics for the Artificial Analysis benchmark sync.
 *
 * Pure module — no network, no credentials — so the maths below is unit-testable
 * and the margins the engine relies on can be verified independently of the feed.
 */

import { AA_FIELDS, FIELD_SPECS } from "./task-ladder";

export const AA_SUITE = "aa";

/**
 * Our catalogue key -> the AA slug, only where the two genuinely differ.
 * Anything not listed here must match by slug exactly; we never fuzzy-match a
 * model name, because silently benchmarking against the wrong variant
 * (reasoning vs non-reasoning, pro vs mini) is worse than having no score.
 */
export const AA_SLUG_ALIASES: Record<string, string> = {
  "openai/gpt-5.4": "gpt-5-4",
  "openai/gpt-5.5": "gpt-5-5",
  "anthropic/claude-opus-4.7-fast": "claude-opus-4-7-non-reasoning",
  "anthropic/claude-opus-4.8-fast": "claude-opus-4-8-non-reasoning",
  "meta-llama/llama-3.3-70b-instruct": "llama-3-3-instruct-70b",
  "qwen/qwen3-32b": "qwen3-32b-instruct",
};

/**
 * Catalogue keys are namespaced by the importer ("openai/gpt-5.6-terra"); AA
 * publishes bare, dash-separated slugs ("gpt-5-6-terra"). Dropping the vendor
 * namespace and writing dots as dashes is a deterministic rewrite of the same
 * identifier, not a fuzzy match — no characters are removed, no suffix is
 * ignored, so "gpt-5-5" can still never collide with "gpt-5-5-mini".
 */
export function aaSlugFor(modelKey: string): string {
  const explicit = AA_SLUG_ALIASES[modelKey];
  if (explicit) return explicit;
  const bare = modelKey.includes("/") ? modelKey.slice(modelKey.indexOf("/") + 1) : modelKey;
  return bare.replaceAll(".", "-");
}


/**
 * Which AA evaluation backs each instrument, plus the published item count of
 * that evaluation. The item count is what makes the margin a measured quantity
 * rather than a guess — see marginFor().
 *
 * We ingest every certifiable field for every model and store it under its own
 * task_class. Which instrument a customer's workload is judged on is decided at
 * decision time by the ranked ladder in ./task-ladder, not at ingest time.
 */
export interface EvalSpec {
  /** Key inside AA's `evaluations` object. */
  field: string;
  /** Number of scored items in the published evaluation set. */
  sampleSize: number;
  label: string;
}

export const INGESTED_FIELDS: EvalSpec[] = AA_FIELDS.map((f) => ({
  field: FIELD_SPECS[f].field,
  sampleSize: FIELD_SPECS[f].sampleSize,
  label: FIELD_SPECS[f].label,
}));

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


/**
 * AA's published Intelligence Index — a real, independently-computed composite.
 * Display-only: excluded above from every certification path, stored under its
 * own suite so it can never be mistaken for an evaluation with a margin.
 */
export const AA_INTELLIGENCE_FIELD = "artificial_analysis_intelligence_index";
export const AA_INTELLIGENCE_SUITE = `${AA_SUITE}:intelligence_index`;


export interface AaModel {
  slug: string;
  name: string;
  evaluations: Record<string, number | null>;
  median_time_to_first_answer_token?: number | null;
  median_time_to_first_token_seconds?: number | null;
  median_output_tokens_per_second?: number | null;
}

/**
 * Measured latency inputs for one model.
 *
 * The feed publishes ONE median per model, taken across the hosts it measures —
 * there is no per-endpoint breakdown in the API. So the scope is always "model"
 * and travels with the value; the engine says so in every recommendation and
 * refusal it makes on this basis rather than implying we timed that host.
 *
 * Two components, not one number, because end-to-end latency depends on how many
 * tokens a workload actually generates: ttft + outputTokens / tps. A workload
 * that emits 40 tokens and one that emits 4,000 do not share a latency.
 */
export interface LatencyRow {
  model_key: string;
  median_ttft_ms: number;
  output_tps: number;
  scope: "model";
  source: string;
}

export const LATENCY_SCOPE_MODEL = "model" as const;

/** Both components must be present and positive, or the model stays unmeasured. */
export function latencyRowFor(modelKey: string, m: AaModel): LatencyRow | null {
  const ttftSeconds = m.median_time_to_first_token_seconds;
  const tps = m.median_output_tokens_per_second;
  if (ttftSeconds == null || tps == null) return null;
  if (!Number.isFinite(Number(ttftSeconds)) || !Number.isFinite(Number(tps))) return null;
  if (Number(ttftSeconds) < 0 || Number(tps) <= 0) return null;
  return {
    model_key: modelKey,
    median_ttft_ms: Math.round(Number(ttftSeconds) * 1000),
    output_tps: Math.round(Number(tps) * 100) / 100,
    scope: LATENCY_SCOPE_MODEL,
    source: `artificialanalysis.ai/${m.slug}#median_time_to_first_token_seconds`,
  };
}

export interface ScoreRow {
  model_key: string;
  suite: string;
  task_class: string;
  score: number;
  /** null for a published composite: AA gives no item count, so no margin exists. */
  sample_size: number | null;
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
  latencies: LatencyRow[];
  margins: { suite: string; task_class: string; margin: number; method: string }[];
  /** Which evaluation was chosen to represent each task class, and why. */
  chosenEvals: { task_class: string; suite: string; label: string; covered: number; sampleSize: number }[];
  matchedModels: string[];
  unmatchedModels: string[];
  skipped: { model_key: string; task_class: string; reason: string }[];
}

/** The suite name carries the evaluation, so a score can never be read against another eval's margin. */
export function suiteFor(spec: EvalSpec): string {
  return `${AA_SUITE}:${spec.field}`;
}

/**
 * Turns a raw AA payload plus our catalogue into rows ready for upsert.
 * A model with no score on the chosen evaluation is left out entirely — the
 * engine's fail-closed path is the correct outcome there, not an imputed number.
 */
export function transformAaPayload(models: AaModel[], catalogKeys: string[]): TransformResult {
  const bySlug = new Map(models.map((m) => [m.slug, m]));
  const scores: ScoreRow[] = [];
  const matchedModels: string[] = [];
  const unmatchedModels: string[] = [];
  const skipped: TransformResult["skipped"] = [];
  const chosenEvals: TransformResult["chosenEvals"] = [];
  const margins: TransformResult["margins"] = [];
  const latencies: LatencyRow[] = [];

  /*
   * Resolution is exact-match only (audit C4).
   *
   * A catalogue key maps to an AA slug either through one explicit alias in
   * AA_SLUG_ALIASES or through aaSlugFor()'s reversible rewrite of the same
   * identifier. There is no normalisation pass, no punctuation stripping, and
   * no nearest-name fallback: "gpt-5.5" and "gpt-5-5-mini" differ by a suffix
   * but are different models, and a fuzzy matcher that bridged them would
   * attach one model's benchmark score to another's price. An unmatched key is
   * recorded in `unmatchedModels` and simply carries no score — the engine then
   * refuses to certify it, which is the correct outcome. Widen coverage by
   * adding an alias, never by loosening the match.
   *
   * Two catalogue keys that resolve to one AA slug (the same model published
   * under two vendor namespaces) are both dropped: there is no way to tell
   * which one the score belongs to, and guessing would mis-certify one of them.
   */
  const bySlugCandidates = new Map<string, string[]>();
  for (const key of catalogKeys) {
    const slug = aaSlugFor(key);
    bySlugCandidates.set(slug, [...(bySlugCandidates.get(slug) ?? []), key]);
  }

  const resolved = new Map<string, AaModel>();
  for (const key of catalogKeys) {
    const slug = aaSlugFor(key);
    const model = bySlug.get(slug);
    const ambiguous = (bySlugCandidates.get(slug) ?? []).length > 1;

    if (!model || ambiguous) {
      unmatchedModels.push(key);
      if (model && ambiguous) {
        skipped.push({
          model_key: key,
          task_class: "*",
          reason: `Ambiguous: ${(bySlugCandidates.get(slug) ?? []).join(", ")} all resolve to ${slug}`,
        });
      }
      continue;
    }
    matchedModels.push(key);
    resolved.set(key, model);
    const latency = latencyRowFor(key, model);
    if (latency) latencies.push(latency);
    else skipped.push({ model_key: key, task_class: "*", reason: `No published latency for ${model.slug}` });
  }


  /*
   * Every certifiable field is ingested for every matched model, under its own
   * task_class (the instrument name). Nothing is chosen here: the ranked ladder
   * decides at decision time which instrument a given workload is judged on.
   */
  for (const spec of INGESTED_FIELDS) {
    const suite = suiteFor(spec);
    let covered = 0;

    for (const [key, model] of resolved) {
      const raw = model.evaluations?.[spec.field];
      if (raw == null || Number.isNaN(Number(raw))) {
        skipped.push({
          model_key: key,
          task_class: spec.field,
          reason: `${spec.label} not reported for ${model.slug}`,
        });
        continue;
      }
      covered++;
      scores.push({
        model_key: key,
        suite,
        task_class: spec.field,
        score: toPoints(Number(raw)),
        sample_size: spec.sampleSize,
        source: `artificialanalysis.ai/${model.slug}#${spec.field}`,
      });
    }

    chosenEvals.push({
      task_class: spec.field,
      suite,
      label: spec.label,
      covered,
      sampleSize: spec.sampleSize,
    });

    const margin = marginFor(
      scores.filter((s) => s.suite === suite && s.task_class === spec.field).map((s) => s.score),
      spec.sampleSize,
    );
    if (Number.isFinite(margin)) {
      margins.push({ suite, task_class: spec.field, margin, method: MARGIN_METHOD });
    }
  }

  /*

   * AA's own published composite, stored verbatim for display only.
   *
   * It is NOT an evaluation with an item count, so it gets no margin row and is
   * filed under task_class "index" — a class no workload ever carries, so the
   * equivalence engine can never read it. That keeps EXCLUDED_FIELDS' rule
   * intact (no certification against a blended index) while letting the catalog
   * show AA's real number instead of an average we computed ourselves.
   */
  for (const [key, model] of resolved) {
    const raw = model.evaluations?.[AA_INTELLIGENCE_FIELD];
    if (raw == null || Number.isNaN(Number(raw))) continue;
    scores.push({
      model_key: key,
      suite: AA_INTELLIGENCE_SUITE,
      task_class: "index",
      score: Math.round(Number(raw) * 10) / 10,
      sample_size: null,
      source: `artificialanalysis.ai/${model.slug}#${AA_INTELLIGENCE_FIELD}`,
    });
  }



  return { scores, latencies, margins, chosenEvals, matchedModels, unmatchedModels, skipped };
}

