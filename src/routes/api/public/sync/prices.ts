import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

/**
 * Scheduled trigger for the OpenRouter pricing sync.
 *
 * Public prefix because an external scheduler calls it, so the shared secret is
 * checked before anything else happens. It writes catalogue and price data
 * only — never customer data, never provider credentials.
 */
export const Route = createFileRoute("/api/public/sync/prices")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.SYNC_CRON_SECRET;
        if (!expected) return new Response("Sync is not configured", { status: 503 });

        const provided = request.headers.get("x-sync-secret") ?? "";
        const a = Buffer.from(provided);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { syncOpenRouterPricing, recordPriceSyncFailure } = await import(
          "@/lib/pricing/sync.server"
        );
        const { runEvaluation, recordRun, classifyRun } = await import(
          "@/lib/engine/evaluate.server"
        );
        const started = new Date();
        try {
          const report = await syncOpenRouterPricing();
          // Chained, not scheduled separately: a price that moved is only worth
          // syncing if the verdict it changes is recomputed in the same window.
          const evaluation = await runEvaluation("pricing-sync");
          // A locked run wrote nothing because another run holds the window,
          // not because the feed came back empty. That is a real quiet run.
          const locked = "skipped" in report && report.skipped === "locked";
          const rows = locked ? 0 : report.priceRowsWritten + report.modelsImported;
          await recordRun({
            job: "pricing-sync",
            started,
            // The catalogue always has rows to write. Zero is never quiet here.
            outcome: locked ? "quiet" : classifyRun(rows, true),
            rowsWritten: rows,
            detail: { sync: report, evaluation },
          });

          return Response.json({ ...report, evaluation });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("pricing sync failed", message);
          await recordPriceSyncFailure(message);
          await recordRun({
            job: "pricing-sync",
            started,
            outcome: "failed",
            rowsWritten: 0,
            error: message,
          });
          // Fail loudly and leave the previous prices in place. A stale price
          // that says it is stale is honest; a guessed one is not.
          return Response.json({ error: message }, { status: 502 });
        }

      },
    },
  },
});
