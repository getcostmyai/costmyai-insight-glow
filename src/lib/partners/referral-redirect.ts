import {
  isPlausibleCode,
  isSecureRequest,
  readCookie,
  readReferralCookie,
  serializeReferralCookie,
} from "@/lib/partners/referral-cookie";
import { SESSION_COOKIE, nextSession } from "@/lib/telemetry/session-cookie";
import {
  VISITOR_COOKIE,
  isPlausibleVisitorId,
  serializeVisitorCookie,
} from "@/lib/telemetry/visitor-cookie";

/**
 * Shared handler for every /r/CODE-shaped entry point (bare and
 * locale-prefixed). This is the ONLY place the cookie-setting / partner-match
 * logic lives. Do not copy this logic into a new route file — add a new thin
 * route file that imports and calls this instead.
 *
 * Behavior contract (must not drift from this — attach_referral at workspace
 * creation relies on the same matching rule):
 *  - First touch wins: an existing cma_ref cookie is never overwritten.
 *  - Matching rule: trimmed, case-insensitive, active partners only.
 *  - Always 302s to "/" regardless of which entry point was hit — there is
 *    no locale-prefixed homepage to redirect to.
 *  - An unknown/invalid code is indistinguishable from a real one from the
 *    outside: same status code, same body (none), always.
 *
 * A first-touch match also records one `referral_click` lead event. That write
 * is deliberately subordinate to the redirect: it is wrapped so a failed
 * insert costs the observation and nothing else, exactly like every other
 * lead_events writer. A repeat click by a browser that already holds the
 * cookie stays a pure no-op and records nothing, so one visitor cannot inflate
 * a partner's click count by reloading the link.
 *
 * The visitor has no cookies at all on a first click, so this handler mints
 * them itself (same ids, same HttpOnly rules as the estimator path) and
 * attaches them to the redirect. That is what lets the click join the rest of
 * the funnel later rather than sitting on an orphan id.
 */
export async function handleReferralRedirect(request: Request, rawCode: string): Promise<Response> {
  const home = new URL("/", request.url).toString();
  const headers = new Headers({ Location: home, "Cache-Control": "no-store" });

  const code = (rawCode ?? "").trim();
  const secure = isSecureRequest(request.url);
  const cookieHeader = request.headers.get("cookie");

  const existing = readReferralCookie(cookieHeader);

  if (!existing && isPlausibleCode(code)) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: partner } = await supabaseAdmin
      .from("partners")
      .select("id, referral_code")
      .ilike("referral_code", code)
      .eq("status", "active")
      .maybeSingle();

    if (partner?.referral_code) {
      headers.append("Set-Cookie", serializeReferralCookie(partner.referral_code, secure));

      const rawVisitor = readCookie(cookieHeader, VISITOR_COOKIE);
      let visitorId: string;
      if (isPlausibleVisitorId(rawVisitor)) {
        visitorId = rawVisitor!.trim();
      } else {
        visitorId = crypto.randomUUID();
        headers.append("Set-Cookie", serializeVisitorCookie(visitorId, secure));
      }

      const session = nextSession(readCookie(cookieHeader, SESSION_COOKIE), Date.now(), secure);
      headers.append("Set-Cookie", session.setCookie);

      try {
        await supabaseAdmin.from("lead_events").insert({
          event_type: "referral_click",
          visitor_id: visitorId,
          session_id: session.id,
          referred_by_partner_id: partner.id,
          is_synthetic: false,
          payload: null as never,
        });
      } catch (err) {
        console.error(
          "referral click not recorded",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  return new Response(null, { status: 302, headers });
}

