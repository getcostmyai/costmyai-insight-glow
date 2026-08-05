import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

/**
 * Retroactive reprocessing sweep (Dispatch 106).
 *
 * Runs hourly and is a no-op in the steady state: it only does work when the
 * deployed parser revision is newer than the one the last sweep ran under.
 * That makes "a new shape parser ships" and "the events it would have fixed
 * get fixed" the same event, without a manual step to forget.
 *
 * `force` re-runs the sweep at the current revision — used when a sweep was
 * interrupted, never to invent a correction.
 */
export const Route = createFileRoute("/api/public/sync/reprocess")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.SYNC_CRON_SECRET;
        if (!expected) return new Response("Reprocessing is not configured", { status: 503 });

        const provided = request.headers.get("x-sync-secret") ?? "";
        const a = Buffer.from(provided);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const body = (await request.json().catch(() => ({}))) as { force?: boolean };

        const { reprocessOnParserChange } = await import("@/lib/ingest/reprocess.server");
        const { recordRun } = await import("@/lib/engine/evaluate.server");
        const started = new Date();

        try {
          const outcome = await reprocessOnParserChange({ force: body.force === true });
          const upgraded = outcome.result?.upgraded ?? 0;
          await recordRun({
            job: "parser-reprocess",
            started,
            // Nothing to repair is the healthy resting state of this job, not a
            // hole: `quiet`, so the board does not colour a working system red.
            outcome: upgraded > 0 ? "ok" : "quiet",
            rowsWritten: upgraded,
            detail: outcome as unknown as Record<string, unknown>,
          });
          return Response.json(outcome);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await recordRun({
            job: "parser-reprocess",
            started,
            outcome: "failed",
            rowsWritten: 0,
            error: message,
          });
          return new Response(message, { status: 500 });
        }
      },
    },
  },
});
