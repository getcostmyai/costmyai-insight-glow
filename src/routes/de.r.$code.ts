import { createFileRoute } from "@tanstack/react-router";

import { handleReferralRedirect } from "@/lib/partners/referral-redirect";

/**
 * /de/r/CODE — German-locale-prefixed counterpart to /r/CODE.
 *
 * This exists solely because a partner may construct or receive a
 * /de/-prefixed link (their site, their assumption, a translation tool —
 * cause doesn't matter). It is NOT the start of general i18n routing: the
 * app has no locale-prefixed homepage or locale-prefixed routes anywhere
 * else, by deliberate prior decision. This route does exactly one thing —
 * calls the same handler /r/$code calls — and still redirects to the
 * non-prefixed "/" homepage, since there is no /de/ homepage to send anyone
 * to.
 *
 * If another locale prefix shows up in practice, add another file exactly
 * like this one. Do not generalize this into a $locale param without a
 * concrete second locale in hand.
 */
export const Route = createFileRoute("/de/r/$code")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        return handleReferralRedirect(request, params.code);
      },
    },
  },
});
