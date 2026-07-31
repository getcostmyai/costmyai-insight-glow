import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

/**
 * Scheduled trigger for the Artificial Analysis benchmark sync.
 *
 * Public prefix because an external scheduler calls it, so the shared secret is
 * checked before anything else happens. It writes measured scores and margins
 * only — never customer data, never provider credentials.
 */
export const Route = createFileRoute("/api/public/sync/benchmarks")({
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

        const { syncArtificialAnalysis, recordSyncFailure } = await import(
          "@/lib/benchmarks/aa-sync.server"
        );
        try {
          const report = await syncArtificialAnalysis();
          return Response.json(report);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("benchmark sync failed", message);
          await recordSyncFailure(message);
          // Fail loudly and leave the previous measurement in place; a stale
          // measured margin is honest, a guessed one is not.
          return Response.json({ error: message }, { status: 502 });
        }
      },
    },
  },
});
