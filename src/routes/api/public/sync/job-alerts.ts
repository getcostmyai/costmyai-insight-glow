import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

/**
 * Scheduled alert sweep for the jobs board.
 *
 * `sync_runs` records every failure honestly, but the only consumer was a page
 * somebody had to open. This schedule reads the same verdicts and pushes the
 * ones that changed to a real outbound channel, so a job that dies at 3am is a
 * message rather than a discovery.
 *
 * It records its own run under `job-alerts`, so the watcher going silent is
 * itself visible on the board it watches.
 */
export const Route = createFileRoute("/api/public/sync/job-alerts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["SYNC_CRON_SECRET"];
        if (!expected) return new Response("Job alerts are not configured", { status: 503 });

        const provided = request.headers.get("x-sync-secret") ?? "";
        const a = Buffer.from(provided);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const body = (await request.json().catch(() => ({}))) as {
          force?: boolean;
          only?: string[];
        };

        const { runJobAlerts } = await import("@/lib/ops/alerts.server");
        const { recordRun } = await import("@/lib/engine/evaluate.server");
        const started = new Date();

        try {
          const sweep = await runJobAlerts({ force: body.force, only: body.only });

          // Nothing to say is this job's healthy resting state. An alert it
          // could not deliver is a failure even though the sweep ran — an
          // undelivered alert is the exact condition this schedule exists to
          // prevent.
          const outcome =
            sweep.failures > 0 ? "failed" : sweep.alerts.length > 0 ? "ok" : "quiet";

          await recordRun({
            job: "job-alerts",
            started,
            outcome,
            rowsWritten: sweep.alerts.length,
            detail: sweep as unknown as Record<string, unknown>,
            error:
              sweep.failures > 0
                ? (sweep.alerts.find((x) => !x.delivered)?.error ?? "alert delivery failed")
                : undefined,
          });

          return Response.json(sweep, { status: sweep.failures > 0 ? 500 : 200 });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await recordRun({
            job: "job-alerts",
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
