/**
 * The token-drift meter (capture only).
 *
 * Once a month it sends the eight frozen tasks in `tasks.ts` to the six pinned
 * models and records exactly what the provider said it billed. That is the
 * whole job. There is deliberately no detector here: with one reading there is
 * nothing to compare, and a detector written today would be a detector nobody
 * could test against real history. Comparison logic ships when there is
 * history to run it against, which is the same discipline the frozen months
 * follow.
 *
 * Three properties make these rows usable as evidence months from now:
 *
 *   - the prompt fingerprint is stored on every row, so a prompt that was
 *     edited between runs is visible in the data rather than hidden inside it;
 *   - a failed call is recorded as a failed row, not dropped, so a gap in a
 *     series always has a stated reason;
 *   - the table is append-only at the database level, so a reading cannot be
 *     tidied up after the fact to make a story work.
 */

import { createHash } from "crypto";

import { recordRun } from "@/lib/engine/evaluate.server";

import { activeModels, activeTasks, expectedObservations, type DriftTask } from "./tasks";

export const DRIFT_JOB = "task-drift";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

/** Ceiling per call. The tasks are small; anything past this is a runaway. */
const MAX_OUTPUT_TOKENS = 1200;
const CALL_TIMEOUT_MS = 120_000;

const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");

interface Observation {
  run_id: string;
  task_id: string;
  task_revision: number;
  prompt_sha256: string;
  model_key: string;
  vendor: string;
  ok: boolean;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  reasoning_tokens: number | null;
  total_tokens: number | null;
  upstream_cost_usd: number | null;
  latency_ms: number | null;
  response_sha256: string | null;
  error: string | null;
  is_fixture: boolean;
}

export interface DriftRunResult {
  runId: string;
  attempted: number;
  written: number;
  failed: number;
  summary: string;
}

interface GatewayUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost_details?: { upstream_inference_cost?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * One reading. Never throws: a provider failure is itself a recorded fact, and
 * one dead model must not cost us the other forty-seven readings in the run.
 */
async function measure(
  apiKey: string,
  runId: string,
  task: DriftTask,
  model: { key: string; vendor: string },
): Promise<Observation> {
  const base = {
    run_id: runId,
    task_id: task.id,
    task_revision: task.revision,
    prompt_sha256: sha256(task.prompt),
    model_key: model.key,
    vendor: model.vendor,
    is_fixture: false,
  };
  const started = Date.now();

  try {
    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model.key,
        max_completion_tokens: MAX_OUTPUT_TOKENS,
        messages: [{ role: "user", content: task.prompt }],
      }),
    });

    const latency = Date.now() - started;

    if (!res.ok) {
      const body = await res.text();
      return {
        ...base,
        ok: false,
        prompt_tokens: null,
        completion_tokens: null,
        reasoning_tokens: null,
        total_tokens: null,
        upstream_cost_usd: null,
        latency_ms: latency,
        response_sha256: null,
        error: `gateway ${res.status}: ${body.slice(0, 300)}`,
      };
    }

    const json = (await res.json()) as {
      usage?: GatewayUsage;
      choices?: { message?: { content?: string } }[];
    };
    const usage = json.usage ?? {};
    const content = json.choices?.[0]?.message?.content ?? "";

    return {
      ...base,
      ok: true,
      prompt_tokens: num(usage.prompt_tokens),
      completion_tokens: num(usage.completion_tokens),
      reasoning_tokens: num(usage.completion_tokens_details?.reasoning_tokens),
      total_tokens: num(usage.total_tokens),
      upstream_cost_usd: num(usage.cost_details?.upstream_inference_cost),
      latency_ms: latency,
      // The reply itself is never stored — only its fingerprint, which is
      // enough to say "the answer changed" without keeping model output around.
      response_sha256: content ? sha256(content) : null,
      error: null,
    };
  } catch (err) {
    return {
      ...base,
      ok: false,
      prompt_tokens: null,
      completion_tokens: null,
      reasoning_tokens: null,
      total_tokens: null,
      upstream_cost_usd: null,
      latency_ms: Date.now() - started,
      response_sha256: null,
      error: err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300),
    };
  }
}

/** Runs the full grid and records it. Returns what it actually wrote. */
export async function runTaskDrift(now = new Date()): Promise<DriftRunResult> {
  const started = now;
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

  const runId = `drift-${started.toISOString().slice(0, 10)}-${started.getTime()}`;
  const tasks = activeTasks();
  const models = activeModels();
  const attempted = expectedObservations();

  const observations: Observation[] = [];
  // Sequential per model, parallel across models: enough concurrency to finish
  // inside a request budget, low enough that no single provider sees a burst.
  await Promise.all(
    models.map(async (model) => {
      for (const task of tasks) {
        observations.push(await measure(apiKey, runId, task, model));
      }
    }),
  );

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("task_drift_observations")
    .insert(observations as never)
    .select("id");
  if (error) throw new Error(`recording drift observations failed: ${error.message}`);

  const written = data?.length ?? 0;
  const failed = observations.filter((o) => !o.ok).length;
  const summary =
    `${written} of ${attempted} readings recorded across ${tasks.length} pinned tasks ` +
    `and ${models.length} pinned models` +
    (failed > 0 ? `, ${failed} of them a recorded provider failure.` : ".");

  return { runId, attempted, written, failed, summary };
}

/** The scheduled entry point: runs the grid and writes the run to the jobs ledger. */
export async function runAndRecordTaskDrift(): Promise<DriftRunResult> {
  const started = new Date();
  try {
    const result = await runTaskDrift(started);
    await recordRun({
      job: DRIFT_JOB,
      started,
      outcome: result.written > 0 ? "ok" : "empty",
      rowsWritten: result.written,
      detail: {
        runId: result.runId,
        attempted: result.attempted,
        failed: result.failed,
        summary: result.summary,
      },
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordRun({
      job: DRIFT_JOB,
      started,
      outcome: "failed",
      rowsWritten: 0,
      error: message.slice(0, 500),
    });
    throw err;
  }
}
