import { z } from "zod";

import {
  INGEST_API_VERSION,
  MAX_CAPTURES_PER_BATCH,
  MAX_EVENTS_PER_BATCH,
  PARSE_STATUSES,
  SUPPORTED_INGEST_API_VERSIONS,
  TASK_HINTS,
  UNKNOWN_TASK_HINT,
} from "./contract";
import { isContentFree } from "../../../packages/gateway-container/src/skeleton";


/**
 * The ingest contract.
 *
 * This is the whole surface the middleware pushes to, and it is deliberately
 * metadata-only: model, host, task hint, token counts, latency, status. There
 * is no prompt field, no completion field, and no place to put one. A payload
 * carrying content is rejected outright rather than quietly stripped, so a
 * misconfigured integration fails loudly instead of sending us text we
 * promised never to hold.
 *
 * The same rule covers credentials: `.strict()` means an API key accidentally
 * attached to an event body is a 422, not something we store.
 */
export const ingestEventSchema = z
  .object({
    occurred_at: z.string().datetime({ offset: true }).optional(),
    model_key: z.string().min(1).max(120),
    host: z.string().min(1).max(120),
    /**
     * Optional, defaulting to `unknown`: real traffic arrives unlabelled and a
     * fabricated label would be worse than an honest refusal downstream.
     */
    task_hint: z.enum(TASK_HINTS).default(UNKNOWN_TASK_HINT),
    input_tokens: z.number().int().min(0).max(10_000_000),
    output_tokens: z.number().int().min(0).max(10_000_000),
    /**
     * Dispatch 204. Prompt-cache counters, both SUBSETS of `input_tokens` — a
     * cached read is an input token billed at a different rate, not an extra
     * token. Optional and defaulted to 0, so every event a pre-204 container
     * sends stays valid unchanged.
     *
     * The subset relationship is enforced below rather than assumed: an event
     * claiming more cached tokens than input tokens is refused, because pricing
     * it would mean charging a negative number of uncached tokens.
     */
    cache_read_tokens: z.number().int().min(0).max(10_000_000).default(0),
    cache_write_tokens: z.number().int().min(0).max(10_000_000).default(0),

    /**
     * Dispatch 234. How sure the classifier was about `task_hint`, 0..1 to two
     * decimals.
     *
     * Optional with NO default, deliberately. A pre-234 container reports a
     * structural label (an `/embeddings` call is `classification`) and no
     * confidence at all; defaulting that to 0 would make it fail the coherence
     * check below and break a payload we promised would keep validating
     * forever. Absent means "not reported", which is a different fact from
     * "reported as zero", and it is stored as 0 rather than refused.
     */
    task_confidence: z
      .number()
      .min(0)
      .max(1)
      .refine((v) => Math.round(v * 100) / 100 === v, {
        message: "task_confidence must be given to at most two decimals",
      })
      .optional(),
    /**
     * Which revision of the local classifier produced the label. Versioned
     * independently of the image tag, exactly like `parser_revision`: 0 means
     * no local classifier ran, which is every pre-232 container and every v2
     * container with classification turned off.
     */
    classifier_revision: z.number().int().min(0).max(1000).default(0),

    latency_ms: z.number().int().min(0).max(3_600_000).nullable().optional(),
    status: z.enum(["ok", "error"]).default("ok"),
    /**
     * How completely the connector could read the provider's response envelope.
     * Additive on v1: an older container that never sends it is treated as
     * `parsed`, exactly as it behaved before the field existed.
     */
    parse_status: z.enum(PARSE_STATUSES).default("parsed"),
    /**
     * A content-free structural skeleton of a response envelope the connector
     * could not read cleanly (Dispatch 106) — keys and numbers only, every
     * string value erased at the source. Retained so a parser shipped later
     * can re-read the event instead of leaving it permanently degraded.
     *
     * The content-free property is re-checked HERE, not trusted: a modified or
     * third-party container that puts a string in this field gets a 422, the
     * same answer a prompt field would get. That is what keeps "we cannot
     * store your content" true for a field whose whole purpose is to store
     * something about a response.
     */
    envelope_skeleton: z
      .unknown()
      .refine((v) => v === undefined || v === null || isContentFree(v), {
        message: "envelope_skeleton must contain no string values",
      })
      .optional(),
    /**
     * Dispatch 155, contract v2. Set only when this container rerouted the
     * request away from what the caller asked for. Absent on v1 and on every
     * unrerouted v2 event, so an unrerouted event is byte-identical to what a
     * v1 container sends.
     *
     * These name a model and a host and nothing else. There is deliberately no
     * field here for the destination credential — the key the customer granted
     * stays in their own container and never crosses this boundary.
     */
    rerouted: z.boolean().optional(),
    original_model_key: z.string().min(1).max(120).optional(),
    original_host: z.string().min(1).max(120).optional(),
    /** Why it moved: the id of the switch that matched. Never free text. */
    route_reason: z.string().uuid().optional(),
    /**
     * Dispatch 155, Stage 5. Set only on the failed rerouted attempt that made
     * the container fall back to the caller's original model. One of four
     * deterministic, pre-billing conditions; never free text.
     */
    fallback_reason: z
      .enum(["connection_error", "model_not_found", "unsupported_parameter", "destination_4xx"])
      .optional(),
    /** Caller-supplied de-duplication key; a retried push must not double-count. */
    idempotency_key: z.string().min(1).max(200).optional(),
  })
  .strict()
  /**
   * A rerouted event that cannot say what it moved away from is unusable for
   * savings reconciliation and would quietly credit the wrong pair. Refused,
   * not defaulted.
   */
  .refine((e) => !e.rerouted || (Boolean(e.original_model_key) && Boolean(e.original_host)), {
    message: "rerouted events must carry original_model_key and original_host",
    path: ["rerouted"],
  })
  /**
   * A fallback is, by definition, something that happened to a rerouted
   * attempt. An event claiming one without saying what it rerouted cannot be
   * reconciled against a switch, so it is refused rather than stored loose.
   */
  .refine((e) => !e.fallback_reason || (e.rerouted === true && Boolean(e.route_reason)), {
    message: "fallback_reason requires a rerouted event carrying route_reason",
    path: ["fallback_reason"],
  })
  /**
   * Dispatch 204. The cache counters are subsets of the input count, and the
   * cost function relies on that: it bills `input - read - write` at the full
   * rate. An event that breaks the invariant would produce a negative uncached
   * term and a nonsense bill, so it is refused at the door rather than clamped
   * silently into something that merely looks plausible.
   */
  .refine((e) => e.cache_read_tokens + e.cache_write_tokens <= e.input_tokens, {
    message: "cache_read_tokens + cache_write_tokens must not exceed input_tokens",
    path: ["cache_read_tokens"],
  })
  /**
   * Dispatch 234, the coherence invariant. When an event reports a confidence
   * at all, it has to agree with its own label: `unknown` means the classifier
   * declined, which is zero confidence by definition, and a real label means it
   * did not decline, which cannot be zero. Either mismatch is a bug in whatever
   * produced the event, and storing it would put a labelled-but-uncertain or
   * unlabelled-but-certain row into the cohorts Certify reads. Refused at the
   * door instead, the same answer a prompt field gets.
   */
  .refine(
    (e) =>
      e.task_confidence === undefined ||
      (e.task_hint === UNKNOWN_TASK_HINT ? e.task_confidence === 0 : e.task_confidence > 0),
    {
      message:
        "task_confidence must be 0 for an unknown task_hint and greater than 0 for any other label",
      path: ["task_confidence"],
    },
  );



/** Payload version. Present on every batch; unknown versions are refused. */
const versionField = z
  .union([z.literal(SUPPORTED_INGEST_API_VERSIONS[0]), z.literal(SUPPORTED_INGEST_API_VERSIONS[1])])
  .default(INGEST_API_VERSION);


export const ingestBatchSchema = z
  .object({
    v: versionField,
    events: z.array(ingestEventSchema).min(1).max(MAX_EVENTS_PER_BATCH),
  })
  .strict();

export type IngestEvent = z.infer<typeof ingestEventSchema>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date");

/**
 * A billing capture: what the provider actually invoiced for a period.
 *
 * Customer-pushed only. We hold no provider credentials and never call a
 * provider's billing API ourselves — the container reads the invoice locally
 * and pushes the total. Which is why there is a currency and an amount here
 * and nothing that could carry a key.
 */
export const billingCaptureSchema = z
  .object({
    provider: z.string().min(1).max(80),
    period_start: isoDate,
    /** Exclusive, so consecutive periods tile without overlapping. */
    period_end: isoDate,
    invoiced_usd: z.number().min(0).max(100_000_000),
    currency: z.string().length(3).default("USD"),
    idempotency_key: z.string().min(1).max(200).optional(),
    /** Set when the provider could not supply the full requested window. */
    coverage_note: z.string().max(400).optional(),
  })
  .strict()
  .refine((c) => c.period_end > c.period_start, {
    message: "period_end must be after period_start",
    path: ["period_end"],
  });

export const billingBatchSchema = z
  .object({
    v: versionField,
    /** True on the first poll after a provider is connected (30-day backfill). */
    backfill: z.boolean().default(false),
    captures: z.array(billingCaptureSchema).min(1).max(MAX_CAPTURES_PER_BATCH),
  })
  .strict();

export type BillingCapture = z.infer<typeof billingCaptureSchema>;
