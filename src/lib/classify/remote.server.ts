import { TASK_HINTS, UNKNOWN_TASK_HINT, type TaskHint } from "@/lib/ingest/contract";

/**
 * Remote task classification (Dispatch 236).
 *
 * One request in, one enum label out. `gpt-5-mini` with strict tool-constrained
 * decoding, chosen on a real 200-item labelled golden set built from Chain
 * Drill Co's own traffic, where the true label is known by construction:
 *
 *   local rules (v2)  36.0% correct,  0.0% wrong  (abstains on two whole buckets)
 *   gpt-5-nano        72.0% correct, 24.0% wrong
 *   gpt-5-mini        96.5% correct,  3.5% wrong
 *
 * nano was rejected on that evidence: it converts honest abstentions into
 * confident wrong labels, and a wrong label silently corrupts Certify while an
 * abstention only costs a recommendation.
 *
 * Measured cost, stated rather than dismissed: at the golden set's mean prompt
 * (463 input / 21 output tokens) this is **$0.159 per 1,000 classifications**;
 * short prompts land near $0.03 and a full 4,000-character window near $0.29.
 * Small in absolute terms, not free, and it scales with traffic.
 */

/** The classifier model. Changing it is a `CLASSIFIER_REVISION` bump, not a swap. */
export const CLASSIFY_MODEL = "gpt-5-mini";

/** Nothing beyond this is read, whatever the caller sends. */
export const MAX_CLASSIFY_CHARS = 4_000;

const LABELS = [...TASK_HINTS] as string[];

const SYSTEM =
  "You classify one LLM API request into exactly one task label.\n" +
  "code: writing, fixing, refactoring or explaining source code, SQL or config.\n" +
  "reasoning: multi-step analysis, maths, proofs, or judgement over given facts.\n" +
  "agentic: the request declares tools/functions or asks for a plan-then-execute loop.\n" +
  "generation: producing prose — summaries, drafts, rewrites, marketing copy.\n" +
  "classification: assigning short labels/tags/sentiment to given items.\n" +
  "unknown: genuinely undecidable.\n" +
  "Answer with the label only.";

const TOOL = {
  type: "function" as const,
  function: {
    name: "label",
    parameters: {
      type: "object",
      properties: { task: { type: "string", enum: LABELS } },
      required: ["task"],
      additionalProperties: false,
    },
    strict: true,
  },
};

export interface ClassifyInput {
  text: string;
  toolsDeclared?: boolean;
  toolTraffic?: boolean;
  schemaConstrained?: boolean;
}

export interface ClassifyResult {
  hint: TaskHint;
  confidence: number;
}

const ABSTAIN: ClassifyResult = { hint: UNKNOWN_TASK_HINT, confidence: 0 };

/**
 * Classify one request's text. Never throws: the caller is a container on a
 * customer's metadata path, and a thrown error there would have to be turned
 * back into the same abstention this returns directly.
 */
export async function classifyRemoteText(input: ClassifyInput): Promise<ClassifyResult> {
  const key = process.env["OPENAI_API_KEY"] ?? process.env["CostMyAI_OpenAI_Test_Key"];
  if (!key) return ABSTAIN;

  const text = input.text.slice(0, MAX_CLASSIFY_CHARS).trim();
  if (text.length < 12 && !input.toolsDeclared && !input.toolTraffic) return ABSTAIN;

  // Structural facts the container already knows are handed to the model as
  // facts, not left for it to infer from prose — this is where nano lost most
  // of its agentic bucket.
  const structural = [
    input.toolsDeclared ? "The request declares tools/functions." : null,
    input.toolTraffic ? "The conversation already contains tool calls or tool results." : null,
    input.schemaConstrained ? "The request constrains output to a JSON schema." : null,
  ].filter(Boolean);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: CLASSIFY_MODEL,
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: structural.length > 0 ? `${structural.join(" ")}\n\n${text}` : text,
          },
        ],
        // gpt-5* default to a reasoning pass that consumes the whole completion
        // budget before any tool call is emitted — finish_reason "length", an
        // empty message, and a harness that looks like a broken model. Minimal
        // effort is required for a one-shot label, not an optimisation.
        reasoning_effort: "minimal",
        max_completion_tokens: 96,
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "label" } },
      }),
    });
    if (!res.ok) return ABSTAIN;
    const json = (await res.json()) as {
      choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }> } }>;
    };
    const raw = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!raw) return ABSTAIN;
    const parsed = JSON.parse(raw) as { task?: unknown };
    const task = typeof parsed.task === "string" ? parsed.task : UNKNOWN_TASK_HINT;
    if (!LABELS.includes(task) || task === UNKNOWN_TASK_HINT) return ABSTAIN;
    // A single-shot constrained label carries no calibrated probability. 0.8 is
    // the honest standing confidence of a 96.5%-accurate classifier that cannot
    // tell you which 3.5% this one is — never 1.0, which would claim certainty
    // the measurement does not support.
    return { hint: task as TaskHint, confidence: 0.8 };
  } catch {
    return ABSTAIN;
  }
}
