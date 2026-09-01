import { createFileRoute } from "@tanstack/react-router";

/**
 * Chart images for the weekly newsletter.
 *
 * Public because an inbox fetches it unauthenticated, and stateless because a
 * sent issue must render the same picture in a year: every number is in the
 * query string, so nothing here reads the database.
 *
 * Same 3s renderer budget as the Intelligence share images, and the same
 * pre-baked PNG fallback. A renderer outage degrades to a plain brand poster,
 * never to a broken image icon in someone's mail client.
 */
export const Route = createFileRoute("/api/public/og/newsletter/chart.png")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const { chartSvg, isChartKind } = await import("@/lib/newsletter/chart-svg.server");
        const { CHART_WIDTH } = await import("@/lib/newsletter/markdown");

        const kind = (url.searchParams.get("kind") ?? "").toLowerCase();
        const data = url.searchParams.get("data") ?? "";
        if (!isChartKind(kind) || data.length === 0 || data.length > 600) {
          return new Response("Bad chart request", { status: 400 });
        }

        const title = (url.searchParams.get("title") ?? "").slice(0, 90);
        const note = (url.searchParams.get("note") ?? "").slice(0, 140);
        const spec = { kind, title, data, ...(note ? { note } : {}) };

        try {
          const { renderSvgToPng } = await import("@/lib/brand/render.server");
          const png = await renderSvgToPng(chartSvg(spec), CHART_WIDTH);
          return new Response(png as unknown as BodyInit, {
            headers: {
              "content-type": "image/png",
              // Frozen input, so it can be cached hard.
              "cache-control": "public, max-age=31536000, immutable",
            },
          });
        } catch (err) {
          console.error(
            "newsletter chart render failed",
            err instanceof Error ? err.message : String(err),
          );
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
