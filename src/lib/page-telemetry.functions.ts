import { createServerFn } from "@tanstack/react-start";

import { sanitizePagePath, sanitizeRouteId } from "./telemetry/page-path";

/**
 * Site-wide page-view telemetry.
 *
 * Same transport as every other tracker here: one POST server function into
 * `recordLeadEvent`, which is the single place that resolves `cma_vid`,
 * `cma_sid` and the referral partner. One generic event fired from the router
 * covers all routes, so no page needs its own wiring.
 *
 * Payload is `{ path, routeId }` — the real path a visitor was on, and the
 * router's own route pattern (`/blog/$slug`), which is a closed known set and
 * makes dynamic pages aggregatable without parsing paths later. Both are
 * clamped in the validator; anything unrecognisable is dropped rather than
 * written.
 *
 * Deliberately NOT consent-gated: it carries nothing beyond the page plus the
 * visitor/session ids that every existing event already writes unprompted.
 */
export const trackPageViewed = createServerFn({ method: "POST" })
  .inputValidator((data: { path?: string; routeId?: string }) => ({
    path: sanitizePagePath(data?.path),
    routeId: sanitizeRouteId(data?.routeId),
  }))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { enforceRateLimit, callerIdentity, RATE_RULES } = await import("./rate-limit.server");
    const request = getRequest();
    await enforceRateLimit(RATE_RULES.pageTelemetry, callerIdentity(request));

    if (!data.path) return { ok: true };

    const { recordLeadEvent, currentSource } = await import("./telemetry/lead-events.server");
    const source = currentSource(request);
    await recordLeadEvent("page_viewed", {
      path: data.path,
      routeId: data.routeId,
      ...(source ? { source } : {}),
    });
    return { ok: true };
  });
