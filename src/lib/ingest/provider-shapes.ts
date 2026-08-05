/**
 * Provider → response-envelope shape, for every host in the live catalog.
 *
 * Dispatch 104 item 1. The connector parses ENVELOPES, not vendors: five
 * parsers were proven, and the open question was whether five actually covers
 * the real catalog. This table is the answer, and it is deliberately honest
 * about how each row was established, because a table that looks complete and
 * is partly guessed is worse than one that says which rows are guesses.
 *
 *   verified   — a real call was made through the real connector to this
 *                provider and the counters came back parsed. (integration tests)
 *   documented — the provider's own current API reference was read and the
 *                field names confirmed.
 *   assumed    — no first-party reference could be read. These are almost all
 *                small OpenAI-compatible inference clouds, and the assumption
 *                is recorded as an assumption. The unrecognised-shape watch,
 *                not this column, is what catches a wrong one.
 *
 * Two things keep a wrong row from being expensive. First, every host here is
 * also reachable through OpenRouter, which normalises to the OpenAI envelope
 * regardless of what the provider speaks natively. Second, a shape the
 * connector cannot read is metered `unparsed` and raises an alert on the jobs
 * board rather than passing as zero spend.
 */

/** The parsers that actually exist in packages/gateway-container/src/parse.ts. */
export const KNOWN_SHAPES = ["openai", "anthropic", "gemini", "cohere", "bedrock", "tencent"] as const;
export type KnownShape = (typeof KNOWN_SHAPES)[number];

export type ShapeConfidence = "verified" | "documented" | "assumed";

export interface ProviderShape {
  /** The host key as it appears in `current_prices.host`. */
  host: string;
  /** What this provider's own primary text-inference API returns. */
  shape: KnownShape;
  confidence: ShapeConfidence;
  /** True when the provider ALSO offers an OpenAI-compatible endpoint. */
  openAiCompatibleAlso?: boolean;
  note?: string;
}

const O = (host: string, confidence: ShapeConfidence = "assumed", note?: string): ProviderShape => ({
  host,
  shape: "openai",
  confidence,
  ...(note ? { note } : {}),
});

export const PROVIDER_SHAPES: ProviderShape[] = [
  // --- non-OpenAI envelopes, all with a dedicated parser ------------------
  {
    host: "anthropic",
    shape: "anthropic",
    confidence: "verified",
    openAiCompatibleAlso: true,
    note: "usage.input_tokens / usage.output_tokens on /v1/messages. Proven live, both natively and through Anthropic's OpenAI-compatible endpoint.",
  },
  {
    host: "claude-platform-on-aws",
    shape: "anthropic",
    confidence: "documented",
    note: "Anthropic's own body, so input_tokens / output_tokens. Under the Bedrock Converse wrapper it is camelCase instead, which the bedrock parser reads.",
  },
  {
    host: "google-ai-studio",
    shape: "gemini",
    confidence: "verified",
    openAiCompatibleAlso: true,
    note: "usageMetadata.promptTokenCount / candidatesTokenCount. Proven live, both natively and through /v1beta/openai/chat/completions.",
  },
  {
    host: "google",
    shape: "gemini",
    confidence: "documented",
    openAiCompatibleAlso: true,
    note: "Vertex AI generateContent, same usageMetadata object as AI Studio.",
  },
  {
    host: "amazon-bedrock",
    shape: "bedrock",
    confidence: "documented",
    note: "Converse API: usage.inputTokens / usage.outputTokens, camelCase.",
  },
  {
    host: "cohere",
    shape: "cohere",
    confidence: "documented",
    note: "meta.billed_units.input_tokens / output_tokens, on both v1 and v2 chat.",
  },
  {
    host: "tencent",
    shape: "tencent",
    confidence: "documented",
    openAiCompatibleAlso: true,
    note: "Hunyuan's TC3 envelope reports Usage.PromptTokens / Usage.CompletionTokens in PascalCase — the one genuine sixth shape this enumeration found. A parser was added for it.",
  },

  // --- OpenAI envelope, confirmed against the provider's own reference ----
  O("openai", "documented", "The canonical envelope: usage.prompt_tokens / completion_tokens."),
  O("azure", "documented", "Azure OpenAI mirrors the OpenAI schema exactly."),
  O("openrouter", "documented", "Normalises every upstream to the OpenAI envelope, plus usage.cost."),
  O("xai", "documented"),
  O("perplexity", "documented"),
  O("moonshot-ai", "documented"),
  O("upstage", "documented"),
  O("siliconflow", "documented"),
  O("z-ai", "documented", "Zhipu GLM's native API is already OpenAI-shaped."),
  O("venice", "documented"),
  O("novita", "documented"),
  O("groq", "documented"),
  O("cerebras", "documented"),
  O("fireworks", "documented"),
  O("deepinfra", "documented"),
  O("deepseek", "documented", "Adds prompt_cache_hit_tokens alongside the standard counters."),
  O("ai21", "documented"),
  {
    host: "alibaba",
    shape: "anthropic",
    confidence: "documented",
    openAiCompatibleAlso: true,
    note: "DashScope native reports usage.input_tokens / output_tokens — the same key names as Anthropic, so the anthropic parser reads it unchanged. Alibaba's compatible-mode endpoint returns the OpenAI envelope.",
  },
  {
    host: "baidu",
    shape: "openai",
    confidence: "documented",
    openAiCompatibleAlso: true,
    note: "Qianfan reports usage.prompt_tokens / completion_tokens; the surrounding envelope differs but the counters sit where the openai parser looks.",
  },
  {
    host: "cloudflare",
    shape: "openai",
    confidence: "documented",
    openAiCompatibleAlso: true,
    note: "Workers AI nests the payload under `result`, so usage sits one level down. The parser unwraps that wrapper rather than falling back to the heuristic tier.",
  },
  {
    host: "minimax",
    shape: "openai",
    confidence: "assumed",
    note: "Reports a usage object; the input/output split was not confirmable from a first-party reference. Watched.",
  },
  {
    host: "reka",
    shape: "anthropic",
    confidence: "assumed",
    openAiCompatibleAlso: true,
    note: "Native Reka has historically used input_tokens / output_tokens. Not re-confirmable; also offers /v1/chat/completions.",
  },

  // --- OpenAI-compatible inference clouds, assumed and watched -----------
  ...[
    "aionlabs",
    "akashml",
    "ambient",
    "arcee-ai",
    "atlascloud",
    "baseten",
    "chutes",
    "coreweave",
    "crusoe",
    "decart",
    "digitalocean",
    "friendli",
    "gmicloud",
    "inception",
    "inceptron",
    "io-net",
    "ionstream",
    "mancer-2",
    "mara",
    "meta",
    "mistral",
    "modelrun",
    "morph",
    "nebius",
    "nex-agi",
    "nextbit",
    "openinference",
    "parasail",
    "perceptron",
    "phala",
    "poolside",
    "relace",
    "sail-research",
    "sakana-ai",
    "sambanova",
    "seed",
    "stepfun",
    "streamlake",
    "together",
    "wafer",
    "xiaomi",
  ].map((h) => O(h)),

  {
    host: "modal",
    shape: "openai",
    confidence: "assumed",
    note: "Serverless GPU hosting rather than a fixed API: the envelope is whatever the customer deployed. Most serve the OpenAI shape (vLLM defaults to it), and anything else is caught by the watch.",
  },
];

const BY_HOST = new Map(PROVIDER_SHAPES.map((p) => [p.host, p]));

export function shapeForHost(host: string): ProviderShape | null {
  return BY_HOST.get(host) ?? null;
}

/** Every host whose shape rests on an assumption rather than a reference. */
export function assumedHosts(): string[] {
  return PROVIDER_SHAPES.filter((p) => p.confidence === "assumed").map((p) => p.host);
}
