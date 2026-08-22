import { getRequest, getResponseHeaders } from "@tanstack/react-start/server";

import {
  isSecureRequest,
  readCookie,
  readReferralCookie,
} from "@/lib/partners/referral-cookie";
import { SESSION_COOKIE, nextSession } from "./session-cookie";
import {
  VISITOR_COOKIE,
  isPlausibleVisitorId,
  serializeVisitorCookie,
} from "./visitor-cookie";

export type LeadEventType =
  | "estimator_viewed"
  | "estimator_engaged"
  | "estimator_completed"
  | "workspace_created"
  | "plan_changed";

/**
 * Append one lead event for a transition that has no browser request behind it
 * — a signed Stripe webhook, or any server-side path where the visitor cookie
 * is simply not in scope. The visitor is carried by
 * `organizations.first_visitor_id`, captured once at workspace creation, so
 * the funnel still joins back to the anonymous visit without inventing an id
 * here.
 *
 * Same swallow-everything rule as `recordLeadEvent`: telemetry never breaks
 * the transition it is observing.
 */
export async function recordAccountLeadEvent(
  eventType: LeadEventType,
  args: { visitorId: string | null; partnerId: string | null; payload: unknown },
): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("lead_events").insert({
      event_type: eventType,
      visitor_id: args.visitorId,
      referred_by_partner_id: args.partnerId,
      payload: (args.payload ?? null) as never,
    });
  } catch (err) {
    console.error("lead event not recorded", err instanceof Error ? err.message : String(err));
  }
}

/**
 * Attach one cookie without clobbering another. `setResponseHeader` *sets*, so
 * two telemetry cookies on one response would leave only the last one — the
 * visitor id would be silently dropped the moment a session cookie is minted
 * beside it.
 */
function appendSetCookie(value: string): void {
  getResponseHeaders().append("Set-Cookie", value);
}

/**
 * Resolve the visitor id for this request, minting one when the browser has
 * none. Generated server-side so the id cannot be spoofed or reset from the
 * page, and set with the same HttpOnly rules as the referral cookie.
 */
export function resolveVisitorId(request: Request): string {
  const existing = readCookie(request.headers.get("cookie"), VISITOR_COOKIE);
  if (isPlausibleVisitorId(existing)) return existing!.trim();

  const id = crypto.randomUUID();
  appendSetCookie(serializeVisitorCookie(id, isSecureRequest(request.url)));
  return id;
}

/**
 * Resolve the session for this request, refreshing its idle window. Same place
 * and same conventions as the visitor id above — this is the only point in the
 * public request flow where telemetry cookies are read and re-attached, so it
 * is the only place a session can be continued or ended.
 */
export function resolveSessionId(request: Request, now: number = Date.now()): string {
  const existing = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  const session = nextSession(existing, now, isSecureRequest(request.url));
  setResponseHeader("Set-Cookie", session.setCookie);
  return session.id;
}

/**
 * Append one lead event.
 *
 * Telemetry must never be able to break the thing it is measuring: every
 * failure here is swallowed, so a bad insert costs an observation and nothing
 * else. Writes go through the service-role client because lead_events accepts
 * no anon or authenticated writes at all — it is append-only, backend-only.
 */
export async function recordLeadEvent(
  eventType: LeadEventType,
  payload: unknown = null,
): Promise<{ visitorId: string | null }> {
  try {
    const request = getRequest();
    const visitorId = resolveVisitorId(request);
    const code = readReferralCookie(request.headers.get("cookie"));

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let partnerId: string | null = null;
    if (code) {
      // Same matching rule the referral path itself uses: trimmed,
      // case-insensitive, active partners only.
      const { data: partner } = await supabaseAdmin
        .from("partners")
        .select("id")
        .ilike("referral_code", code)
        .eq("status", "active")
        .maybeSingle();
      partnerId = partner?.id ?? null;
    }

    await supabaseAdmin.from("lead_events").insert({
      event_type: eventType,
      visitor_id: visitorId,
      referred_by_partner_id: partnerId,
      payload: (payload ?? null) as never,
    });

    return { visitorId };
  } catch (err) {
    console.error("lead event not recorded", err instanceof Error ? err.message : String(err));
    return { visitorId: null };
  }
}
