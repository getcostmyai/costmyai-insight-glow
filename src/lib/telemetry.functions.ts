import { createServerFn } from "@tanstack/react-start";

import type { LeadEventType } from "./telemetry/lead-events.server";

const ALLOWED: LeadEventType[] = ["estimator_viewed", "estimator_engaged"];

/**
 * Public estimator telemetry.
 *
 * Only the two client-observable moments live here — "viewed" and "engaged" —
 * because those never touch the server otherwise. "estimator_completed" is
 * written inside estimateSavingFn itself, where the real inputs and the real
 * outcome (including a refusal) are already in scope and cannot be faked by
 * the page.
 */
export const trackEstimatorEvent = createServerFn({ method: "POST" })
  .inputValidator((data: { event: LeadEventType }) => ({
    event: (ALLOWED.includes(data?.event) ? data.event : "estimator_viewed") as LeadEventType,
  }))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { enforceRateLimit, callerIdentity, RATE_RULES } = await import("./rate-limit.server");
    await enforceRateLimit(RATE_RULES.estimatorTelemetry, callerIdentity(getRequest()));

    const { recordLeadEvent } = await import("./telemetry/lead-events.server");
    await recordLeadEvent(data.event);
    return { ok: true };
  });
