import { createFileRoute } from "@tanstack/react-router";

import {
  isPlausibleCode,
  isSecureRequest,
  readReferralCookie,
  serializeReferralCookie,
} from "@/lib/partners/referral-cookie";

/**
 * /r/CODE — the link a partner actually shares.
 *
 * It sets a first-touch cookie and sends the visitor to the homepage. It never
 * tells the visitor whether the code was real: an unknown code and a real code
 * are indistinguishable from the outside, so the endpoint cannot be used to
 * enumerate partners. Attribution itself happens later, at workspace creation,
 * through the same attach_referral path a manually typed code uses.
 */
export const Route = createFileRoute("/r/$code")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const home = new URL("/", request.url).toString();
        const headers = new Headers({ Location: home, "Cache-Control": "no-store" });

        const code = (params.code ?? "").trim();

        // First touch wins: an existing cookie is never overwritten.
        const existing = readReferralCookie(request.headers.get("cookie"));

        if (!existing && isPlausibleCode(code)) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          // Same matching rule as attach_referral: trimmed, case-insensitive,
          // active partners only.
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
      },
    },
  },
});
