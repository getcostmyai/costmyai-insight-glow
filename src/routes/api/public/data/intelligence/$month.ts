import { createFileRoute } from "@tanstack/react-router";

/**
 * Data export for one Intelligence month.
 *
 * Public because the point is reuse: an analyst quoting a figure should be able
 * to pull the whole table and check it. Only frozen months and the live page
 * payload are reachable, and both contain nothing but public catalogue figures.
 *
 *   /api/public/data/intelligence/2026-05?format=csv
 *   /api/public/data/intelligence/live?format=json
 */
export const Route = createFileRoute("/api/public/data/intelligence/$month")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const format = url.searchParams.get("format") === "json" ? "json" : "csv";

        const { MONTH_KEY_RE, readFrozenMonth } = await import("@/lib/intelligence/snapshot.server");

        let payload;
        let month = params.month;
        if (params.month === "live") {
          const { readIntelligence } = await import("@/lib/intelligence/intelligence.server");
          payload = await readIntelligence();
          month = payload.monthStart.slice(0, 7);
        } else {
          if (!MONTH_KEY_RE.test(params.month)) {
            return new Response("Invalid month", { status: 400 });
          }
          const frozen = await readFrozenMonth(params.month);
          if (!frozen) return new Response("Month not frozen", { status: 404 });
          payload = frozen.payload;
        }

        const { toCsv, toJson } = await import("@/lib/intelligence/export");
        const filename = `costmyai-intelligence-${month}.${format}`;
        const body = format === "json" ? JSON.stringify(toJson(payload, month), null, 2) : toCsv(payload, month);

        return new Response(body, {
          headers: {
            "content-type":
              format === "json" ? "application/json; charset=utf-8" : "text/csv; charset=utf-8",
            "content-disposition": `attachment; filename="${filename}"`,
            "cache-control": params.month === "live" ? "public, max-age=300" : "public, max-age=86400",
          },
        });
      },
    },
  },
});
