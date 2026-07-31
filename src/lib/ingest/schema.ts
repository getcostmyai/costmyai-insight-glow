import { z } from "zod";

/**
 * The ingest contract.
 *
 * This is the whole surface the middleware pushes to, and it is deliberately
 * metadata-only: model, host, task hint, token counts, latency, status. There
 * is no prompt field, no completion field, and no place to put one. A payload
 * carrying content is rejected outright rather than quietly stripped, so a
 * misconfigured integration fails loudly instead of sending us text we
 * promised never to hold.
 */
export const ingestEventSchema = z
  .object({
    occurred_at: z.string().datetime({ offset: true }).optional(),
    model_key: z.string().min(1).max(120),
    host: z.string().min(1).max(120),
    task_hint: z.enum(["generation", "code", "classification"]),
    input_tokens: z.number().int().min(0).max(10_000_000),
    output_tokens: z.number().int().min(0).max(10_000_000),
    latency_ms: z.number().int().min(0).max(3_600_000).nullable().optional(),
    status: z.enum(["ok", "error"]).default("ok"),
    /** Caller-supplied de-duplication key; a retried push must not double-count. */
    idempotency_key: z.string().min(1).max(200).optional(),
  })
  .strict();

export const ingestBatchSchema = z
  .object({
    events: z.array(ingestEventSchema).min(1).max(1000),
  })
  .strict();

export type IngestEvent = z.infer<typeof ingestEventSchema>;
