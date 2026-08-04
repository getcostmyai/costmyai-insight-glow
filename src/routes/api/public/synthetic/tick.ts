import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

/**
 * The synthetic ecosystem's heartbeat.
 *
 * Called every minute by the scheduler. It works out how much time has passed
 * since the demo workspace last received traffic, generates exactly the events
 * the ecosystem would have produced in that gap, and pushes them through the
 * real `/api/public/v1/events` endpoint with a real workspace API key — the same
 * path a customer's middleware takes. Nothing here writes to the database
 * directly, so the demo cannot drift away from how the product actually works.
 *
 * The generator is deterministic per time slice, so a retried or overlapping
 * tick regenerates identical events with identical idempotency keys and ingest
 * discards them. Double-counting is impossible by construction.
 */
export const Route = createFileRoute("/api/public/synthetic/tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.SYNC_CRON_SECRET;
        if (!expected) return new Response("Tick is not configured", { status: 503 });

        const provided = request.headers.get("x-sync-secret") ?? "";
        const a = Buffer.from(provided);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { runSyntheticTick } = await import("@/lib/synthetic/tick.server");
        const { recordRun, classifyRun } = await import("@/lib/engine/evaluate.server");
        const started = new Date();
        try {
          const origin = new URL(request.url).origin;
          const report = await runSyntheticTick(origin);
          /*
           * Dispatch 65. This collector is the one that produces usage rows,
           * and until now it wrote nothing at all to the run ledger — which is
           * why 1 August 2026 looked healthy on 413 pricing runs while not a
           * single usage row landed. It now records its own outcome, measured
           * on rows, not on the fact that the handler returned.
           *
           * `duplicates` count as rows present: a replayed slice means ingest
           * already holds that data, which is observation, not a hole. Only a
           * tick that generated events and got neither accepted nor duplicate
           * back is "empty" — expected data that did not land.
           */
          const present = report.accepted + report.duplicates;
          await recordRun({
            job: "usage-tick",
            started,
            outcome: classifyRun(present, report.generated > 0),
            rowsWritten: present,
            detail: report,
          });
          return Response.json(report);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("synthetic tick failed", message);
          await recordRun({
            job: "usage-tick",
            started,
            outcome: "failed",
            rowsWritten: 0,
            error: message,
          });
          return Response.json({ error: message }, { status: 502 });
        }

      },
    },
  },
});
