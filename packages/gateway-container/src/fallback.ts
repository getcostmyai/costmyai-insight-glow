/**
 * Fallback policy for a rerouted request (Dispatch 155, Stage 5).
 *
 * Rerouting introduces a failure class that did not exist before: a request
 * that fails *because of a decision CostMyAI made*. The policy is deliberately
 * the narrowest thing that is honest about that:
 *
 *  - Exactly four deterministic, pre-billing conditions fall back to the
 *    caller's original model. Every one of them means the destination refused
 *    the request outright, before doing any work the customer will be billed
 *    for.
 *  - Nothing else falls back. A 5xx and a timeout are explicitly NOT in the
 *    set: the destination may well have started, or finished, generating a
 *    completion the customer is paying for. Retrying those is how you
 *    double-bill someone, which is the one thing this container has never done
 *    (see the no-retry rule in proxy.ts, load-bearing since Dispatch 99).
 *  - The fallback is strictly pre-first-byte. Once a single byte of the
 *    destination's response has been handed to the caller, there is no retry
 *    under any condition — that is a structural property of where this is
 *    called from, not a check performed here.
 *
 * A fallback is never silent: it is disclosed on the caller's own response, it
 * emits its own event, and it is reported to the control plane, which pauses
 * the switch if a workspace is seeing them repeatedly.
 */

export type FallbackReason =
  /** The destination could not be reached at all. Nothing was billed. */
  | "connection_error"
  /** The destination does not know this model. Nothing was generated. */
  | "model_not_found"
  /** The request carried a parameter this model does not accept. */
  | "unsupported_parameter"
  /** Any other 4xx: the destination refused the request as malformed or barred. */
  | "destination_4xx";

export const FALLBACK_REASONS: readonly FallbackReason[] = [
  "connection_error",
  "model_not_found",
  "unsupported_parameter",
  "destination_4xx",
];

/**
 * A transport-level failure of a rerouted attempt.
 *
 * An abort is our own timeout firing, which means the destination may already
 * be generating. It is NOT a fallback condition, on purpose.
 */
export function classifyTransportFailure(aborted: boolean): FallbackReason | null {
  return aborted ? null : "connection_error";
}

const MODEL_MISSING =
  /(model[^.]{0,40}(not\s*found|does\s*not\s*exist|is\s*(not|un)\s*(known|available|supported)|invalid))|((unknown|unsupported|invalid|nonexistent)[^.]{0,20}model)|model_not_found/i;

const PARAM_REJECTED =
  /(unsupported|unrecognized|unrecognised|unknown|invalid|extra)[^.]{0,30}(parameter|argument|field|property|key)|(parameter|property|argument)[^.]{0,30}(not\s*supported|is\s*not\s*allowed|unsupported)|unsupported_value|invalid_request_error/i;

/**
 * A response-level failure of a rerouted attempt, read from status and body.
 *
 * The body is only ever pattern-matched for these two classifications and is
 * never stored, forwarded to us, or logged — the same rule that governs every
 * other byte passing through this container.
 */
export function classifyResponseFailure(status: number, body: string): FallbackReason | null {
  // 2xx/3xx: the destination accepted the request. Not our business.
  if (status < 400) return null;
  // 5xx: the destination may have generated, and may have billed. Never retried.
  if (status >= 500) return null;

  if (MODEL_MISSING.test(body)) return "model_not_found";
  // Only a 400 is read as a parameter problem; a 401/403/429 saying "invalid"
  // is about credentials or quota, and belongs in the generic 4xx bucket.
  if (status === 400 && PARAM_REJECTED.test(body)) return "unsupported_parameter";
  return "destination_4xx";
}

/** How much of an error body is read before classification. Bounded on purpose. */
export const MAX_ERROR_BODY_BYTES = 16 * 1024;
