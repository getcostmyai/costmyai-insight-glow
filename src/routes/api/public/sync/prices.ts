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
        try {
          return Response.json(await syncOpenRouterPricing());
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("pricing sync failed", message);
          await recordPriceSyncFailure(message);
          // Fail loudly and leave the previous prices in place. A stale price
          // that says it is stale is honest; a guessed one is not.
          return Response.json({ error: message }, { status: 502 });
        }
      },
    },
  },
});
