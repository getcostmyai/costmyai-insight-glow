import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

/**
 * Scheduled rollup coverage check (Dispatch 232).
 *
 * The customer's own usage pipeline had no scheduled job at all: rollups were
 * rebuilt inline per ingest request, after the events were already committed,
 * with no ledger entry and no health check that looked at the transform. A
 * rebuild that threw was invisible — events kept arriving, the ingest banner
 * stayed green, and every spend, saving and switch figure understated until
 * somebody happened to notice.
 *
 * This route is the missing schedule. It compares what we hold against what we
 * have counted, repairs the difference from the events themselves, and — the
 * part that actually matters — writes the outcome to `sync_runs`, so silence
 * from this job is now itself a fault the jobs board can see.
 */
export const Route = createFileRoute("/api/public/sync/rollup-health")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.SYNC_CRON_SECRET;
        if (!expected) return new Response("Rollup health is not configured", { status: 503 });

        const provided = request.headers.get("x-sync-secret") ?? "";
        const a = Buffer.from(provided);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const body = (await request.json().catch(() => ({}))) as { repair?: boolean };

        const { sweepRollups } = await import("@/lib/ingest/rollup-sweep.server");
        const { recordRun } = await import("@/lib/engine/evaluate.server");
        const started = new Date();

        try {
          const sweep = await sweepRollups({ repair: body.repair !== false });

          /*
           * Nothing to repair is this job's healthy resting state, so it is
           * `quiet` rather than a red line on the board. A hole it could not
           * close is `failed` even though the sweep itself ran: the job exists
           * to make that condition loud.
           */
          const outcome =
            sweep.failures > 0 ? "failed" : sweep.orgsRepaired > 0 ? "ok" : "quiet";

          await recordRun({
            job: "rollup-health",
            started,
            outcome,
            rowsWritten: sweep.bucketsWritten,
            detail: sweep as unknown as Record<string, unknown>,
            error:
              sweep.failures > 0
                ? (sweep.results.find((r) => r.error)?.error ?? "rollup repair failed")
                : undefined,
          });


          return Response.json(sweep, { status: sweep.failures > 0 ? 500 : 200 });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await recordRun({
            job: "rollup-health",
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
