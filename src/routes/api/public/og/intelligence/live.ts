import { createFileRoute } from "@tanstack/react-router";

/**
 * Per-card social preview image for the live, still-open month.
 *
 * Mirrors the frozen `$month` endpoint, with one deliberate difference: the
 * figure it draws is still moving, so the poster is stamped "as of <time> ·
 * live, still moving" instead of "final, frozen figures", and it is cached for
 * minutes rather than a year.
 *
 * Public because Slack, X and LinkedIn crawlers fetch it unauthenticated. It
 * reads only public KPI figures — no customer data can reach it.
 */
export const Route = createFileRoute("/api/public/og/intelligence/live")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { readIntelligence } = await import("@/lib/intelligence/intelligence.server");
        const { findShareCard } = await import("@/lib/intelligence/share-cards");

        const url = new URL(request.url);
        const cardId = url.searchParams.get("card") ?? "kpi-moves";

        // Same function the live page itself calls, so the image cannot show a
        // different number from the card it was shared from.
        const data = await readIntelligence();
        const card = findShareCard(data, cardId);
        if (!card) return new Response("Unknown card", { status: 404 });

        const citation = {
          kind: "live" as const,
          monthLabel: data.monthLabel,
          generatedAt: data.generatedAt,
        };

        try {
          const { renderShareImage } = await import("@/lib/intelligence/share-image.server");
          return await renderShareImage(card, citation, url.origin);
        } catch (err) {
          console.error(
            "live share image render failed",
            err instanceof Error ? err.message : String(err),
          );
          /*
           * Never SVG here. LinkedIn's crawler cannot parse an SVG og:image and
           * shows "No image found", and the bad answer then sits in cache for
           * the route's TTL. This is a pre-baked PNG read straight from bytes,
           * with no call to the renderer service, so a renderer outage cannot
           * reach it.
           */
          const { ogFallbackPngBytes } = await import(
            "@/lib/intelligence/generated/og-fallback-png"
          );
          return new Response(ogFallbackPngBytes() as unknown as BodyInit, {
            headers: {
              "content-type": "image/png",
              "cache-control": "public, max-age=120",
              "x-costmyai-render": "static-png-fallback",
            },
          });
        }
      },
    },
  },
});
