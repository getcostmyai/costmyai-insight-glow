import { createServerFn } from "@tanstack/react-start";

import type { LeadEventType } from "./telemetry/lead-events.server";

const ALLOWED: LeadEventType[] = [
  "estimator_viewed",
  "estimator_engaged",
  "estimator_line_added",
  "estimator_line_changed",
  "estimator_line_removed",
  "estimator_split_changed",
];

/**
 * Public estimator telemetry.
 *
 * Every client-observable moment of the allocation bar lands here — the
 * progression events carry a real payload (which line, which workload, the
 * before and after shares), because "someone touched it" was never enough to
 * tell us where a visitor gives up. "estimator_completed" is still written
 * inside the estimate call itself, where the real inputs and the real outcome
 * (including a refusal) are already in scope and cannot be faked by the page.
 */
export const trackEstimatorEvent = createServerFn({ method: "POST" })
  .inputValidator((data: { event: LeadEventType; payload?: unknown }) => ({
    event: (ALLOWED.includes(data?.event) ? data.event : "estimator_viewed") as LeadEventType,
    // Bounded: telemetry may not become an arbitrary write channel.
    payload: clampPayload(data?.payload ?? null),
  }))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { enforceRateLimit, callerIdentity, RATE_RULES } = await import("./rate-limit.server");
    await enforceRateLimit(RATE_RULES.estimatorTelemetry, callerIdentity(getRequest()));

    const { recordLeadEvent } = await import("./telemetry/lead-events.server");
    await recordLeadEvent(data.event, data.payload);
    return { ok: true };
  });

function clampPayload(payload: unknown): unknown {
  if (payload == null) return null;
  try {
    const json = JSON.stringify(payload);
    if (json.length > 4_000) return { truncated: true };
    return JSON.parse(json);
  } catch {
    return null;
  }
}
