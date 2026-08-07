import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

/**
 * The standing lead detector (Dispatch 144).
 *
 * Daily, after the pricing and benchmark syncs have had a full cycle to land.
 * Nothing here publishes: it files leads into an editorial queue, and a human
 * decides whether any of them becomes a note.
 */
export const Route = createFileRoute("/api/public/sync/intelligence-leads")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.SYNC_CRON_SECRET;
        if (!expected) return new Response("Lead detection is not configured", { status: 503 });

        const provided = request.headers.get("x-sync-secret") ?? "";
        const a = Buffer.from(provided);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { runAndRecordLeadDetectors } = await import("@/lib/intelligence/leads.server");
        try {
          const result = await runAndRecordLeadDetectors();
          return Response.json(result);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return new Response(message, { status: 500 });
        }
      },
    },
  },
});
