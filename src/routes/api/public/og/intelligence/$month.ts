import { createFileRoute } from "@tanstack/react-router";

/**
 * Per-card social preview image for a frozen month.
 *
 * Public because Slack, X and LinkedIn crawlers fetch it unauthenticated. It
 * reads only frozen public KPI figures — no customer data can reach it — and it
 * refuses any month that has not been frozen, so an image can never show a
 * number that is still moving.
 */
export const Route = createFileRoute("/api/public/og/intelligence/$month")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { readFrozenMonth, MONTH_KEY_RE } = await import(
          "@/lib/intelligence/snapshot.server"
        );
        if (!MONTH_KEY_RE.test(params.month)) {
          return new Response("Invalid month", { status: 400 });
        }

        const frozen = await readFrozenMonth(params.month);
        if (!frozen) return new Response("Month not frozen", { status: 404 });

        const url = new URL(request.url);
        const cardId = url.searchParams.get("card") ?? "kpi-moves";

        const { findShareCard } = await import("@/lib/intelligence/share-cards");
        const card = findShareCard(frozen.payload, cardId);
        if (!card) return new Response("Unknown card", { status: 404 });

        try {
          const { renderShareImage } = await import("@/lib/intelligence/share-image.server");
          return await renderShareImage(card, { kind: "frozen", monthKey: frozen.month }, url.origin);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("share image render failed", message);
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
              "cache-control": "public, max-age=300",
              "x-costmyai-render": "static-png-fallback",
            },
          });
        }
      },
    },
  },
});
