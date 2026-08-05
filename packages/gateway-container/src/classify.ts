import { UNKNOWN_TASK_HINT, type TaskHint } from "./config.js";

/**
 * Coarse task classification.
 *
 * Structural signals only: the request PATH and the MODEL NAME. This function
 * cannot see prompt or completion content — it is never given any — which is
 * what keeps the "metadata only, never your prompt content" promise true at
 * the one place in the system where content is physically present.
 *
 * Anything it cannot place structurally is `unknown`, and unknown is honest:
 * the certification ladder refuses on it rather than borrowing an unrelated
 * benchmark. A fabricated label would silently corrupt Certify, the
 * "overpowered for the task" cards and the k-anonymity cohorts.
 */

/** Endpoints whose purpose is unambiguous from the path alone. */
const PATH_RULES: Array<{ test: RegExp; hint: TaskHint }> = [
  { test: /\/(embeddings|embed)\b/i, hint: "classification" },
  { test: /\/(moderations|classify|rerank)\b/i, hint: "classification" },
];

/** Model families whose entire purpose is one kind of work. */
const MODEL_RULES: Array<{ test: RegExp; hint: TaskHint }> = [
  { test: /(^|[/\-_])(text-)?embedding/i, hint: "classification" },
  { test: /(^|[/\-_])(rerank|moderation|guard)/i, hint: "classification" },
  { test: /(^|[/\-_])(codestral|code-|coder|codex|starcoder|deepseek-coder)/i, hint: "code" },
];

export function classifyTask(path: string, model: string | null): TaskHint {
  for (const rule of PATH_RULES) if (rule.test.test(path)) return rule.hint;
  if (model) for (const rule of MODEL_RULES) if (rule.test.test(model)) return rule.hint;
  // A general chat/completions call is genuinely unlabelled work. We do not
  // know whether it is code, generation or classification, and the only
  // signal that would tell us is the content we promised never to read.
  return UNKNOWN_TASK_HINT;
}

/**
 * Whether this request is the real-time inference the connector is scoped to.
 * Out-of-scope paths (batch, fine-tuning, files, assistants) are still
 * forwarded verbatim; they just report no derived usage.
 */
// Google's native routes name the method after a COLON
// (`/v1beta/models/gemini-flash-latest:generateContent`), not a slash, so the
// separator class has to admit both — found against real Gemini traffic,
// Dispatch 103. With only `/` here, every native Google call was forwarded
// correctly and then silently never metered.
const IN_SCOPE =
  /[/:](chat\/completions|completions|responses|messages|generateContent|streamGenerateContent|converse|invoke|embeddings|embed|rerank|moderations|generate|chat)\b/i;
const OUT_OF_SCOPE = /\/(batches|fine_tuning|fine-tunes|files|assistants|threads|vector_stores|uploads|realtime)\b/i;

export function isInScope(path: string): boolean {
  if (OUT_OF_SCOPE.test(path)) return false;
  return IN_SCOPE.test(path);
}
