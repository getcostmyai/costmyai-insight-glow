import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

/**
 * The standing schema-filter check (Dispatch 111).
 *
 * Daily. The source half of the check only changes on deploy; the database
 * half — a new lifecycle column, or a guard that has just gone live because
 * the first delisted/synthetic/revoked row landed — changes on its own, and
 * daily is well inside the window where that matters.
 *
 * Runs entirely inside the app's own environment against the live database.
 * Nothing here needs CI: there is no source checkout, no toolchain and no
 * GitHub credential in the path.
 */
export const Route = createFileRoute("/api/public/sync/schema-filters")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.SYNC_CRON_SECRET;
        if (!expected) return new Response("Schema checking is not configured", { status: 503 });

        const provided = request.headers.get("x-sync-secret") ?? "";
        const a = Buffer.from(provided);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { runAndRecordSchemaFilterCheck } = await import("@/lib/ops/schema-filters.server");
        try {
          const result = await runAndRecordSchemaFilterCheck();
          return Response.json({
            summary: result.summary,
            required: result.required,
            advisoryCount: result.advisory.length,
            queriesChecked: result.queriesChecked,
            tablesWatched: result.tablesWatched,
            staleSites: result.staleSites,
            manifestGeneratedAt: result.manifestGeneratedAt,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return new Response(message, { status: 500 });
        }
      },
    },
  },
});
