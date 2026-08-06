import { createFileRoute } from "@tanstack/react-router";

/**
 * The badge image itself, public by design.
 *
 * It renders only for an active partner code; anything else is a real 404, so a
 * pasted badge for a lapsed or invented partner visibly breaks instead of
 * quietly looking legitimate.
 */
export const Route = createFileRoute("/api/public/badge/$code")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { readPartnerBadge, renderBadgePng, badgeVerifyUrl, BADGE_CODE_RE } = await import(
          "@/lib/partner-badge.server"
        );
        const code = params.code.replace(/\.png$/i, "");
        if (!BADGE_CODE_RE.test(code)) return new Response("Invalid code", { status: 400 });

        const badge = await readPartnerBadge(code);
        if (!badge) return new Response("Not an active partner", { status: 404 });

        const origin = new URL(request.url).origin;
        try {
          const png = await renderBadgePng(badge, origin, badgeVerifyUrl(origin, badge.code));
          return new Response(png as unknown as BodyInit, {
            headers: {
              "content-type": "image/png",
              // Short cache: a tier or status change must show up quickly.
              "cache-control": "public, max-age=300",
            },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("partner badge render failed", message);
          return new Response(`Badge unavailable: ${message}`, { status: 500 });
        }
      },
    },
  },
});
