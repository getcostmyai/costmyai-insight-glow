import { createFileRoute } from "@tanstack/react-router";

import { handleReferralRedirect } from "@/lib/partners/referral-redirect";

/**
 * /r/CODE — the link a partner actually shares.
 *
 * It sets a first-touch cookie and sends the visitor to the homepage. It never
 * tells the visitor whether the code was real: an unknown code and a real code
 * are indistinguishable from the outside, so the endpoint cannot be used to
 * enumerate partners. Attribution itself happens later, at workspace creation,
 * through the same attach_referral path a manually typed code uses.
 *
 * src/routes/de.r.$code.ts is the German-locale counterpart; both call the same
 * shared handler in @/lib/partners/referral-redirect so they cannot drift apart.
 */
export const Route = createFileRoute("/r/$code")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        return handleReferralRedirect(request, params.code);
      },
    },
  },
});
