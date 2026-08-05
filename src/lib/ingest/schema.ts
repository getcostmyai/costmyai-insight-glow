import { z } from "zod";

import {
  INGEST_API_VERSION,
  MAX_CAPTURES_PER_BATCH,
  MAX_EVENTS_PER_BATCH,
  PARSE_STATUSES,
  TASK_HINTS,
  UNKNOWN_TASK_HINT,
} from "./contract";

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
    latency_ms: z.number().int().min(0).max(3_600_000).nullable().optional(),
    status: z.enum(["ok", "error"]).default("ok"),
    /**
     * How completely the connector could read the provider's response envelope.
     * Additive on v1: an older container that never sends it is treated as
     * `parsed`, exactly as it behaved before the field existed.
     */
    parse_status: z.enum(PARSE_STATUSES).default("parsed"),
    /** Caller-supplied de-duplication key; a retried push must not double-count. */
    idempotency_key: z.string().min(1).max(200).optional(),
  })
  .strict();


/** Payload version. Present on every batch; unknown versions are refused. */
const versionField = z.literal(INGEST_API_VERSION).default(INGEST_API_VERSION);

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
