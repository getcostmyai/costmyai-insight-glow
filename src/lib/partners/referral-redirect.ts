import {
  isPlausibleCode,
  isSecureRequest,
  readReferralCookie,
  serializeReferralCookie,
} from "@/lib/partners/referral-cookie";

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
 */
export async function handleReferralRedirect(request: Request, rawCode: string): Promise<Response> {
  const home = new URL("/", request.url).toString();
  const headers = new Headers({ Location: home, "Cache-Control": "no-store" });

  const code = (rawCode ?? "").trim();

  const existing = readReferralCookie(request.headers.get("cookie"));

  if (!existing && isPlausibleCode(code)) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: partner } = await supabaseAdmin
      .from("partners")
      .select("referral_code")
      .ilike("referral_code", code)
      .eq("status", "active")
      .maybeSingle();

    if (partner?.referral_code) {
      headers.append(
        "Set-Cookie",
        serializeReferralCookie(partner.referral_code, isSecureRequest(request.url)),
      );
    }
  }

  return new Response(null, { status: 302, headers });
}
