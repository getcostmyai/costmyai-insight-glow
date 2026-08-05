import type { ParseStatus } from "./config.js";
import { envelopeSkeleton } from "./skeleton.js";

/**
 * Bumped whenever a parser is added or an existing one changes behaviour.
 *
 * Dispatch 106: the app compares this against the revision it last reprocessed
 * under. A deploy that changes it triggers one retroactive sweep over the
 * events that were metered degraded, so a shape learned in month three repairs
 * the traffic recorded in month one instead of leaving it permanently wrong.
 *
 *  1 — five shapes (openai, anthropic, gemini, cohere, bedrock)
 *  2 — Dispatch 104: tencent added, wrapper envelopes unwrapped (Cloudflare)
 */
export const PARSER_REVISION = 2;

/**
 * Response-envelope parsing.
 *
 * The connector parses ENVELOPES, not models. Once a shape is handled, every
 * model that provider ever ships is covered without a code change — which is
 * why the test suite is organised by shape and not by the 305 tracked models.
 *
 * Nothing here reads message content. The parsers touch usage counters and the
 * model identifier and nothing else; the prompt and the completion are bytes
 * this module is deliberately incapable of interpreting.
 */

export type ShapeId =
  | "openai"
  | "anthropic"
  | "gemini"
  | "cohere"
  | "bedrock"
  | "tencent"
  | "heuristic"
  | "unknown";

export interface UsageReading {
  inputTokens: number;
  outputTokens: number;
  model: string | null;
  shape: ShapeId;
  parseStatus: ParseStatus;
  /**
   * Present only when the read was NOT clean: a content-free structural
   * skeleton of the envelope (see skeleton.ts), retained so a future parser
   * can re-read what this one could not. Never set on a `parsed` reading.
   */
  skeleton?: unknown;
}

const EMPTY: UsageReading = {
  inputTokens: 0,
  outputTokens: 0,
  model: null,
  shape: "unknown",
  parseStatus: "unparsed",
};

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * The real distinct shapes across the tracked providers, enumerated against the
 * live catalog in Dispatch 104: openai, anthropic, gemini, cohere, bedrock and
 * tencent. Ordered most specific first; `heuristic` is the "we found counters
 * we recognise in an envelope we don't" tier, which reports `tokens_only`
 * rather than pretending to be sure.
 */
export function readUsage(payload: unknown): UsageReading {
  const root = asRecord(payload);
  if (!root) return EMPTY;

  const model = typeof root["model"] === "string" ? (root["model"] as string) : null;
  const usage = asRecord(root["usage"]);

  // 1. OpenAI-compatible: OpenAI, Groq, DeepInfra, Together, Fireworks,
  //    Mistral, xAI, Perplexity, OpenRouter, Azure OpenAI, vLLM, Ollama.
  if (usage) {
    const pt = num(usage["prompt_tokens"]);
    const ct = num(usage["completion_tokens"]);
    if (pt !== null || ct !== null) {
      return { inputTokens: pt ?? 0, outputTokens: ct ?? 0, model, shape: "openai", parseStatus: "parsed" };
    }

    // 2. Anthropic native (also Anthropic-on-Bedrock and -on-Vertex).
    const it = num(usage["input_tokens"]);
    const ot = num(usage["output_tokens"]);
    if (it !== null || ot !== null) {
      return {
        inputTokens: it ?? 0,
        outputTokens: ot ?? 0,
        model,
        shape: "anthropic",
        parseStatus: "parsed",
      };
    }

    // 5. AWS Bedrock Converse: camelCase counters under the same key.
    const bi = num(usage["inputTokens"]);
    const bo = num(usage["outputTokens"]);
    if (bi !== null || bo !== null) {
      return {
        inputTokens: bi ?? 0,
        outputTokens: bo ?? 0,
        model,
        shape: "bedrock",
        parseStatus: "parsed",
      };
    }
  }

  // 6. Tencent Hunyuan's TC3 envelope: PascalCase counters under `Usage`.
  //    Found by the Dispatch 104 enumeration — the one provider in the live
  //    catalog whose native shape none of the first five parsers could read.
  const tencent = asRecord(root["Usage"]) ?? asRecord(asRecord(root["Response"])?.["Usage"]);
  if (tencent) {
    const pt = num(tencent["PromptTokens"]);
    const ct = num(tencent["CompletionTokens"]);
    if (pt !== null || ct !== null) {
      const response = asRecord(root["Response"]);
      return {
        inputTokens: pt ?? 0,
        outputTokens: ct ?? 0,
        model:
          typeof root["Model"] === "string"
            ? (root["Model"] as string)
            : typeof response?.["Model"] === "string"
              ? (response["Model"] as string)
              : model,
        shape: "tencent",
        parseStatus: "parsed",
      };
    }
  }

  // 3. Google / Gemini native (generateContent and Vertex).
  const meta = asRecord(root["usageMetadata"]);
  if (meta) {
    const pt = num(meta["promptTokenCount"]);
    const ct = num(meta["candidatesTokenCount"]);
    const total = num(meta["totalTokenCount"]);
    // Dispatch 109, found on a real thinking-model call: Google bills reasoning
    // tokens as output but reports them OUTSIDE candidatesTokenCount. A real
    // response came back with candidates=1 and thoughts=67 — reading candidates
    // alone under-counted the billed output by 68x, which silently understates
    // cost and breaks reconciliation against the invoice.
    const thoughts = num(meta["thoughtsTokenCount"]);
    if (pt !== null || ct !== null || total !== null) {
      const input = pt ?? 0;
      const generated = ct !== null || thoughts !== null ? (ct ?? 0) + (thoughts ?? 0) : null;
      return {
        inputTokens: input,
        outputTokens: generated ?? (total !== null ? Math.max(0, total - input) : 0),
        model: typeof root["modelVersion"] === "string" ? (root["modelVersion"] as string) : model,
        shape: "gemini",
        parseStatus: "parsed",
      };
    }
  }


  // 4. Cohere native: meta.billed_units / meta.tokens.
  const cohereMeta = asRecord(root["meta"]);
  const billed = asRecord(cohereMeta?.["billed_units"]) ?? asRecord(cohereMeta?.["tokens"]);
  if (billed) {
    const it = num(billed["input_tokens"]);
    const ot = num(billed["output_tokens"]);
    if (it !== null || ot !== null) {
      return {
        inputTokens: it ?? 0,
        outputTokens: ot ?? 0,
        model,
        shape: "cohere",
        parseStatus: "parsed",
      };
    }
  }

  // Wrapper envelopes: Cloudflare Workers AI returns { success, result: { ... } }
  // with the real payload one level down. Unwrap once and re-read, so the
  // reading is reported as the shape it actually is rather than as a guess.
  for (const key of ["result", "Response", "data", "output"]) {
    const inner = asRecord(root[key]);
    if (!inner) continue;
    const nested = readUsage(inner);
    if (nested.parseStatus === "parsed") return { ...nested, model: nested.model ?? model };
  }

  // Last resort: an unrecognised envelope that still carries counters we know
  // by name. Reported honestly as tokens_only so the team can add a real
  // parser — the customer's spend is not silently wrong in the meantime.
  const found = scanForCounters(root);
  if (found)
    return {
      ...found,
      model,
      shape: "heuristic",
      parseStatus: "tokens_only",
      skeleton: envelopeSkeleton(root),
    };

  return { ...EMPTY, model, skeleton: envelopeSkeleton(root) };
}

const INPUT_KEYS = [
  "prompt_tokens",
  "input_tokens",
  "inputTokens",
  "promptTokenCount",
  "prompt_eval_count",
  "PromptTokens",
  "InputTokens",
];
const OUTPUT_KEYS = [
  "completion_tokens",
  "output_tokens",
  "outputTokens",
  "candidatesTokenCount",
  "eval_count",
  "generation_tokens",
  "CompletionTokens",
  "OutputTokens",
];
/**
 * Reasoning tokens are BILLED AS OUTPUT but reported separately by every vendor
 * that exposes them, and they are routinely far larger than the visible answer
 * (Dispatch 109 saw 67 thinking tokens behind 1 answer token on a real call).
 * They are added to the output count, never counted as their own thing.
 */
const REASONING_KEYS = ["thoughtsTokenCount", "reasoning_tokens", "reasoningTokens"];


/** Bounded-depth walk for known counter names. Never looks at string content. */
function scanForCounters(
  root: Record<string, unknown>,
  depth = 0,
): { inputTokens: number; outputTokens: number } | null {
  if (depth > 4) return null;
  let input: number | null = null;
  let output: number | null = null;
  for (const [key, value] of Object.entries(root)) {
    if (input === null && INPUT_KEYS.includes(key)) input = num(value);
    if (output === null && OUTPUT_KEYS.includes(key)) output = num(value);
    const child = asRecord(value);
    if (child && (input === null || output === null)) {
      const nested = scanForCounters(child, depth + 1);
      if (nested) {
        input = input ?? nested.inputTokens;
        output = output ?? nested.outputTokens;
      }
    }
  }
  if (input === null && output === null) return null;
  return { inputTokens: input ?? 0, outputTokens: output ?? 0 };
}

/**
 * Streaming.
 *
 * Usage only ever appears at the very start (Anthropic's `message_start`) or
 * the very end (OpenAI's final `usage` chunk, Anthropic's `message_delta`,
 * Gemini's last `usageMetadata`) of a stream. So we keep a bounded head window
 * and a bounded tail window and nothing in between — the body itself is piped
 * straight through to the caller and never accumulated.
 */
export const STREAM_WINDOW_BYTES = 16 * 1024;

export class StreamUsageCollector {
  private head = "";
  private tail = "";
  private headFull = false;

  feed(chunk: string): void {
    if (!this.headFull) {
      this.head += chunk;
      if (this.head.length >= STREAM_WINDOW_BYTES) {
        this.head = this.head.slice(0, STREAM_WINDOW_BYTES);
        this.headFull = true;
      }
    }
    this.tail += chunk;
    if (this.tail.length > STREAM_WINDOW_BYTES) {
      this.tail = this.tail.slice(-STREAM_WINDOW_BYTES);
    }
  }

  /** Best reading across every JSON object visible in the two windows. */
  finish(): UsageReading {
    let best: UsageReading | null = null;
    let model: string | null = null;
    let skeleton: unknown = null;
    for (const object of jsonObjectsIn(this.head + "\n" + this.tail)) {
      const reading = readUsage(object);
      if (reading.model && !model) model = reading.model;
      // Keep the last skeleton offered: in a stream the usage frame is the one
      // at the end, so a later frame is the more useful thing to re-read.
      if (reading.skeleton) skeleton = reading.skeleton;
      if (reading.parseStatus === "unparsed") continue;
      if (!best) {
        best = reading;
        continue;
      }
      // Anthropic reports input at the start and output at the end; take the
      // maximum of each rather than letting the last frame overwrite the first.
      best = {
        ...best,
        inputTokens: Math.max(best.inputTokens, reading.inputTokens),
        outputTokens: Math.max(best.outputTokens, reading.outputTokens),
        parseStatus: best.parseStatus === "parsed" ? "parsed" : reading.parseStatus,
        shape: best.shape === "heuristic" ? reading.shape : best.shape,
      };
    }
    if (!best) return { ...EMPTY, model, skeleton };
    if (best.parseStatus === "parsed") return { ...best, model: best.model ?? model, skeleton: undefined };
    return { ...best, model: best.model ?? model, skeleton: best.skeleton ?? skeleton };
  }
}

/**
 * Every complete top-level JSON object in a text window, whether it arrived as
 * SSE `data:` frames (OpenAI, Anthropic), a JSON array of chunks (Gemini), or
 * newline-delimited JSON. Truncated fragments at the window edges are skipped.
 */
export function* jsonObjectsIn(text: string): Generator<unknown> {
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
      continue;
    }
    if (ch === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        try {
          yield JSON.parse(text.slice(start, i + 1));
        } catch {
          /* a fragment clipped by the window boundary — skipped, never guessed */
        }
        start = -1;
      }
      if (depth < 0) depth = 0;
    }
  }
}
