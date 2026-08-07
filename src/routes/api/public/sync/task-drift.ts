import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

/**
 * The monthly token-drift meter.
 *
 * Sends the eight frozen tasks to the six pinned models and records what each
 * provider says it billed. Capture only: nothing here compares runs, and
 * nothing here publishes. It exists so that in six months the comparison can
 * be made against real readings rather than reconstructed from memory.
 */
export const Route = createFileRoute("/api/public/sync/task-drift")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["SYNC_CRON_SECRET"];
        if (!expected) return new Response("Drift capture is not configured", { status: 503 });

        const provided = request.headers.get("x-sync-secret") ?? "";
        const a = Buffer.from(provided);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { runAndRecordTaskDrift } = await import("@/lib/drift/capture.server");
        try {
          return Response.json(await runAndRecordTaskDrift());
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return new Response(message, { status: 500 });
        }
      },
    },
  },
});
