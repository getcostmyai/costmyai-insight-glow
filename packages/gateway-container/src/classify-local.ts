import { UNKNOWN_TASK_HINT, type TaskHint } from "./config.js";

/**
 * Local task classification (Dispatch 232, Phase 1).
 *
 * This is the first code in the system that reads prompt content, and it is
 * deliberately the narrowest thing that can work:
 *
 *  1. It runs INSIDE THE CUSTOMER'S OWN CONTAINER, on their own machine, in
 *     the process they run. No text it reads is ever spooled, logged, kept
 *     after the function returns, or sent to CostMyAI. The only thing that
 *     leaves this file is one of six enum labels.
 *  2. It is opt-in (`COSTMYAI_CLASSIFY_LOCAL`). With the flag unset the
 *     container behaves exactly as it did before: path and model name only.
 *  3. It is pure and synchronous. No network, no filesystem, no model
 *     download, no native binary, no GPU. Rules and integer arithmetic over a
 *     bounded window of text.
 *  4. **It abstains rather than guesses.** A weak or ambiguous read returns
 *     `unknown` with a reason, which the ladder refuses on. A fabricated label
 *     silently corrupts Certify, the "overpowered for the task" cards and the
 *     k-anonymity cohorts; `unknown` costs a recommendation and lies about
 *     nothing. This is the same rule as DECISIONS.md §12, now applied to a
 *     classifier that can see more.
 */

/** Nothing beyond this many characters of extracted text is examined. */
const MAX_TEXT_CHARS = 4_000;
/** Nothing beyond this many messages is walked, newest-biased. */
const MAX_MESSAGES = 24;
/** Bodies larger than this are not parsed at all — a 20MB base64 image is not a prompt. */
const MAX_BODY_BYTES = 1_000_000;

/** Below this top score there is not enough evidence to call anything. */
const MIN_SCORE = 4;
/** The winner must beat the runner-up by this much, unless they certify identically. */
const MIN_MARGIN = 2;

export type AbstainReason =
  /** Body was not JSON, or was too large to read. */
  | "unreadable"
  /** JSON parsed, but no prompt text could be located in a shape we know. */
  | "no_content"
  /** Text found, but nothing in it points anywhere. Ordinary open-ended chat. */
  | "weak_signal"
  /** Two different instruments are equally plausible. Refusing beats coin-flipping. */
  | "ambiguous";

export interface TaskDecision {
  hint: TaskHint;
  /** 0..1. Only meaningful when `hint` is not `unknown`. */
  confidence: number;
  /** Where the label came from. `abstained` always means `hint === "unknown"`. */
  source: "path" | "model" | "structure" | "content" | "abstained";
  /** Set only when `source === "abstained"`. */
  abstained?: AbstainReason;
  /**
   * Names of the signals that fired — feature identifiers such as
   * `code.fenced_block`, never a byte of the text that matched them. Held for
   * in-process diagnostics; never enqueued, never spooled, never sent.
   */
  signals: string[];
}

/**
 * The five certification buckets. `generation` and `classification` both
 * resolve to the LCR instrument, so a tie between exactly those two is not a
 * real ambiguity — either label produces the same verdict — and the margin
 * rule is waived for it. A tie between `code` and `reasoning` is a real one.
 */
const BUCKET: Record<string, string> = {
  code: "code",
  reasoning: "reasoning",
  agentic: "agentic",
  generation: "lcr",
  classification: "lcr",
};

interface Signal {
  id: string;
  test: RegExp;
  hint: string;
  weight: number;
}

const TEXT_SIGNALS: Signal[] = [
  // ---- code ---------------------------------------------------------------
  { id: "code.fenced_block", test: /```/, hint: "code", weight: 4 },
  {
    id: "code.syntax",
    test: /(^|\n)\s*(def |class |function |import |from \w+ import|#include|package |func |public static|const \w+ =|SELECT .+ FROM)/im,
    hint: "code",
    weight: 3,
  },
  {
    id: "code.failure_output",
    test: /\b(stack ?trace|traceback|segmentation fault|npm ERR|TypeError|NullPointerException|panic:|compile[rd]? error|syntax error)\b/i,
    hint: "code",
    weight: 3,
  },
  {
    id: "code.imperative",
    test: /\b(write|fix|implement|refactor|optimi[sz]e|debug|port|migrate)\b[^.\n]{0,40}\b(function|method|class|script|query|component|endpoint|module|test|bug|regex|migration)\b/i,
    hint: "code",
    weight: 3,
  },
  { id: "code.filename", test: /\b[\w./-]+\.(py|ts|tsx|jsx?|go|rs|java|rb|cpp|cs|php|sql|sh|yaml|toml)\b/i, hint: "code", weight: 2 },
  { id: "code.diff", test: /(^|\n)(diff --git|@@ -\d|\+\+\+ b\/)/m, hint: "code", weight: 4 },

  // ---- reasoning ----------------------------------------------------------
  {
    id: "reasoning.deliberate",
    test: /\b(step[- ]by[- ]step|reason through|think carefully|show your work|derive|prove that|justify your)\b/i,
    hint: "reasoning",
    weight: 3,
  },
  {
    id: "reasoning.multiple_choice",
    test: /(which of the following|choose the correct|\n\s*\(?[A-D][).]\s+\S)/,
    hint: "reasoning",
    weight: 3,
  },
  {
    id: "reasoning.quantitative",
    test: /\b(calculate|compute|solve for|integral|derivative|theorem|probability that|how many .+ (are|can|would))\b/i,
    hint: "reasoning",
    weight: 2,
  },
  { id: "reasoning.latex", test: /(\\frac|\\sum|\\int|\\begin\{|\$\$)/, hint: "reasoning", weight: 3 },
  {
    id: "reasoning.analytic",
    test: /\b(explain why|what causes|compare and contrast|trade-?offs?|implications of|which is better and why)\b/i,
    hint: "reasoning",
    weight: 2,
  },

  // ---- agentic ------------------------------------------------------------
  {
    id: "agentic.scaffold",
    test: /(^|\n)\s*(Thought:|Action:|Observation:|Final Answer:)/m,
    hint: "agentic",
    weight: 4,
  },
  {
    id: "agentic.tool_instruction",
    test: /\b(use the (following )?tools?|call the (function|tool)|you have access to the following (tools|functions)|invoke the tool)\b/i,
    hint: "agentic",
    weight: 4,
  },
  {
    id: "agentic.plan",
    test: /\b(plan the steps|break (this|it) down into steps|then execute|multi-?step (task|workflow)|orchestrat(e|ing))\b/i,
    hint: "agentic",
    weight: 2,
  },

  // ---- classification (LCR) ----------------------------------------------
  {
    id: "classification.verb",
    test: /\b(classify|categori[sz]e|label (this|the following)|sentiment|detect the intent|is this (spam|toxic|relevant|safe))\b/i,
    hint: "classification",
    weight: 4,
  },
  {
    id: "classification.closed_set",
    test: /\b(respond with (only |just )?(one word|a single word|yes or no|true or false)|choose one of|from the following (categories|labels|options))\b/i,
    hint: "classification",
    weight: 4,
  },
  {
    id: "classification.extraction",
    test: /\b(extract (the )?(fields?|entities|values?|data|json)|parse the following into|return (valid )?json)\b/i,
    hint: "classification",
    weight: 3,
  },
  { id: "classification.rating", test: /\brate (this|the following)[^.\n]{0,30}\b(from|on a scale)\b/i, hint: "classification", weight: 3 },

  // ---- generation (LCR) ---------------------------------------------------
  {
    id: "generation.compose",
    // Up to a few words of qualifier between the verb and the artefact:
    // "draft a launch announcement email" is the same instruction as "draft an
    // email", and the tight version of this pattern missed it.
    test: /\b(write|draft|compose|generate)\b[^.\n]{0,40}?\b(email|blog post|blog|post|essay|story|poem|article|summary|description|copy|caption|screenplay|letter|announcement|press release)\b/i,
    hint: "generation",
    weight: 4,
  },
  {
    id: "generation.transform",
    test: /\b(summari[sz]e|rewrite|rephrase|paraphrase|translate|proofread|shorten|expand on|make (this|it) (shorter|longer|clearer|more))\b/i,
    hint: "generation",
    weight: 4,
  },
  { id: "generation.marketing", test: /\b(headline|tagline|newsletter|landing page|product description|ad copy)\b/i, hint: "generation", weight: 2 },
];

/** Text pulled out of a request, plus the structural facts around it. */
interface Extracted {
  text: string;
  /** A tool/function schema was declared on the request. */
  toolsDeclared: boolean;
  /** A previous tool call or tool result is present in the conversation. */
  toolTraffic: boolean;
  /** A JSON schema / structured-output constraint was set. */
  schemaConstrained: boolean;
  /** The caller's own output cap, when it set one. */
  maxTokens: number | null;
  turns: number;
}

function pushText(into: string[], value: unknown): void {
  if (typeof value === "string") {
    into.push(value);
    return;
  }
  if (!Array.isArray(value)) return;
  for (const part of value) {
    if (typeof part === "string") {
      into.push(part);
      continue;
    }
    if (!part || typeof part !== "object") continue;
    const obj = part as Record<string, unknown>;
    if (typeof obj["text"] === "string") into.push(obj["text"]);
    if (typeof obj["content"] === "string") into.push(obj["content"]);
  }
}

function isToolPart(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.some((part) => {
    if (!part || typeof part !== "object") return false;
    const type = (part as Record<string, unknown>)["type"];
    return type === "tool_use" || type === "tool_result";
  });
}

/**
 * Lift prompt text and structural facts out of a request body.
 *
 * Knows the four shapes this container actually sees: OpenAI chat/completions
 * and responses, Anthropic messages, Google generateContent, and Cohere chat.
 * A shape it does not recognise yields no text, which becomes `no_content` and
 * therefore `unknown` — never a guess from a half-understood body.
 */
export function extractSignalText(body: Uint8Array | undefined): Extracted | null {
  if (!body || body.byteLength === 0 || body.byteLength > MAX_BODY_BYTES) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;
  const chunks: string[] = [];

  // System-level instruction, every dialect.
  pushText(chunks, obj["system"]);
  pushText(chunks, obj["instructions"]);
  pushText(chunks, obj["preamble"]);
  const sysInstruction = (obj["systemInstruction"] ?? obj["system_instruction"]) as Record<string, unknown> | undefined;
  if (sysInstruction && typeof sysInstruction === "object") pushText(chunks, sysInstruction["parts"]);

  // Plain completions and Cohere.
  pushText(chunks, obj["prompt"]);
  pushText(chunks, obj["message"]);
  pushText(chunks, obj["input"]);

  let toolTraffic = false;
  let turns = 0;

  const messages = (obj["messages"] ?? obj["chat_history"] ?? obj["contents"]) as unknown;
  if (Array.isArray(messages)) {
    // Newest messages carry the live instruction; an old system preamble is
    // still read, but a 400-turn history is not walked in full.
    const window = messages.slice(-MAX_MESSAGES);
    turns = messages.length;
    for (const message of window) {
      if (!message || typeof message !== "object") continue;
      const m = message as Record<string, unknown>;
      const role = typeof m["role"] === "string" ? m["role"] : "";
      if (role === "tool" || role === "function" || m["tool_calls"] || m["tool_call_id"] || m["functionCall"]) {
        toolTraffic = true;
      }
      if (isToolPart(m["content"]) || isToolPart(m["parts"])) toolTraffic = true;
      pushText(chunks, m["content"]);
      pushText(chunks, m["parts"]);
      pushText(chunks, m["message"]);
    }
  }

  const generationConfig = (obj["generationConfig"] ?? obj["generation_config"]) as Record<string, unknown> | undefined;
  const responseFormat = obj["response_format"] as Record<string, unknown> | undefined;
  const schemaConstrained = Boolean(
    (responseFormat && typeof responseFormat === "object" && responseFormat["type"] !== "text") ||
      obj["response_schema"] ||
      obj["guided_json"] ||
      (generationConfig &&
        typeof generationConfig === "object" &&
        (generationConfig["responseSchema"] ?? generationConfig["response_schema"] ?? generationConfig["responseMimeType"] === "application/json")),
  );

  const maxRaw =
    obj["max_tokens"] ??
    obj["max_output_tokens"] ??
    obj["max_completion_tokens"] ??
    (generationConfig && typeof generationConfig === "object" ? generationConfig["maxOutputTokens"] : undefined);
  const maxTokens = typeof maxRaw === "number" && Number.isFinite(maxRaw) ? maxRaw : null;

  const tools = obj["tools"] ?? obj["functions"] ?? obj["tool_config"] ?? obj["toolConfig"];
  const toolsDeclared = Array.isArray(tools) ? tools.length > 0 : Boolean(tools) || Boolean(obj["tool_choice"]);

  return {
    text: chunks.join("\n").slice(0, MAX_TEXT_CHARS),
    toolsDeclared,
    toolTraffic,
    schemaConstrained,
    maxTokens,
    turns,
  };
}

const ABSTAIN = (reason: AbstainReason, signals: string[] = []): TaskDecision => ({
  hint: UNKNOWN_TASK_HINT,
  confidence: 0,
  source: "abstained",
  abstained: reason,
  signals,
});

/**
 * Classify one request from its own content. Pure; returns a label and never
 * the text it read.
 */
export function classifyContent(body: Uint8Array | undefined): TaskDecision {
  const extracted = extractSignalText(body);
  if (!extracted) return ABSTAIN("unreadable");
  if (extracted.text.trim().length < 12 && !extracted.toolsDeclared && !extracted.toolTraffic) {
    return ABSTAIN("no_content");
  }

  const scores: Record<string, number> = {};
  const signals: string[] = [];
  const add = (hint: string, weight: number, id: string): void => {
    scores[hint] = (scores[hint] ?? 0) + weight;
    signals.push(id);
  };

  // ---- structural certainties ---------------------------------------------
  // A conversation that already contains a tool call or tool result IS agent
  // execution. This is not an inference from wording; it is the wire shape.
  if (extracted.toolTraffic) {
    return { hint: "agentic", confidence: 0.95, source: "structure", signals: ["agentic.tool_traffic"] };
  }
  if (extracted.toolsDeclared) add("agentic", 4, "agentic.tools_declared");

  // A schema-constrained request capped to a handful of tokens is a label being
  // produced, not prose. Both halves are required: schema alone is how people
  // get structured long-form output too.
  if (extracted.schemaConstrained && extracted.maxTokens !== null && extracted.maxTokens <= 64) {
    return { hint: "classification", confidence: 0.9, source: "structure", signals: ["classification.schema_capped"] };
  }
  if (extracted.schemaConstrained) add("classification", 2, "classification.schema");
  if (extracted.maxTokens !== null && extracted.maxTokens <= 16) add("classification", 2, "classification.tiny_cap");

  // ---- text evidence -------------------------------------------------------
  for (const signal of TEXT_SIGNALS) {
    if (signal.test.test(extracted.text)) add(signal.hint, signal.weight, signal.id);
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) return ABSTAIN("weak_signal");

  const [topHint, topScore] = ranked[0] as [string, number];
  const runnerUp = ranked[1];
  if (topScore < MIN_SCORE) return ABSTAIN("weak_signal", signals);

  if (runnerUp) {
    const margin = topScore - runnerUp[1];
    // Waived only when the runner-up certifies through the SAME instrument:
    // generation vs classification both resolve to LCR, so the verdict is
    // identical either way and refusing would cost a real recommendation for
    // a distinction that changes nothing downstream.
    const sameInstrument = BUCKET[topHint] === BUCKET[runnerUp[0]];
    if (margin < MIN_MARGIN && !sameInstrument) return ABSTAIN("ambiguous", signals);
  }

  const spread = runnerUp ? (topScore - runnerUp[1]) / topScore : 1;
  const confidence = Math.min(0.95, Math.round((0.55 + spread * 0.4) * 100) / 100);
  return { hint: topHint as TaskHint, confidence, source: "content", signals };
}
