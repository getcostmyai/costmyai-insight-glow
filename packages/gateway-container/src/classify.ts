import { classifyContent, type TaskDecision } from "./classify-local.js";
import { UNKNOWN_TASK_HINT, type TaskHint } from "./config.js";

/**
 * Coarse task classification.
 *
 * Two layers, in this order:
 *
 *  1. **Structural, always on.** The request PATH and the MODEL NAME only.
 *     This layer cannot see prompt content — it is never given any — which is
 *     what keeps the default posture identical to every container shipped
 *     before Dispatch 232.
 *  2. **Local content classification, opt-in.** Only when the customer sets
 *     `COSTMYAI_CLASSIFY_LOCAL`, `classifyContent()` reads the request body
 *     inside their own container and returns a label. The text never leaves
 *     the process; only the enum does. See classify-local.ts.
 *
 * Anything neither layer can place is `unknown`, and unknown is honest: the
 * certification ladder refuses on it rather than borrowing an unrelated
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
  // A general chat/completions call is genuinely unlabelled work to this layer.
  return UNKNOWN_TASK_HINT;
}

/**
 * The full decision for one request.
 *
 * Structural tells win over content: a request to `/embeddings` is a
 * classification call whatever its text says, and reading further could only
 * make that answer worse. Content is consulted exactly when structure came
 * back `unknown` AND the customer turned it on.
 */
export function classifyRequest(input: {
  path: string;
  model: string | null;
  body: Uint8Array | undefined;
  readContent: boolean;
}): TaskDecision {
  for (const rule of PATH_RULES) {
    if (rule.test.test(input.path)) {
      return { hint: rule.hint, confidence: 0.99, source: "path", signals: ["path"] };
    }
  }
  if (input.model) {
    for (const rule of MODEL_RULES) {
      if (rule.test.test(input.model)) {
        return { hint: rule.hint, confidence: 0.95, source: "model", signals: ["model"] };
      }
    }
  }
  if (!input.readContent) {
    // The pre-232 answer, unchanged: we do not know, and the only signal that
    // would tell us is content this customer has not asked us to read.
    return { hint: UNKNOWN_TASK_HINT, confidence: 0, source: "abstained", abstained: "no_content", signals: [] };
  }
  return classifyContent(input.body);
}

export type { TaskDecision } from "./classify-local.js";


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
