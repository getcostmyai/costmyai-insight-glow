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
        const { runEvaluation, recordRun, classifyRun } = await import(
          "@/lib/engine/evaluate.server"
        );
        const started = new Date();
        try {
          const report = await syncArtificialAnalysis();
          // Chained for the same reason as the pricing sync: a moved benchmark
          // can change an equivalence verdict on its own, and nobody should
          // have to open a page for that to be noticed.
          const evaluation = await runEvaluation("benchmark-sync");
          const rows =
            report.scoresWritten + report.latenciesWritten + report.marginsWritten.length;
          await recordRun({
            job: "benchmark-sync",
            started,
            // A benchmark sync that upserts nothing is never a quiet day: the
            // feed always carries scores. Zero rows means the run produced
            // nothing it should have produced.
            outcome: classifyRun(rows, true),
            rowsWritten: rows,
            detail: { sync: report, evaluation },
          });
          return Response.json({ ...report, evaluation });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("benchmark sync failed", message);
          await recordSyncFailure(message);
          await recordRun({
            job: "benchmark-sync",
            started,
            outcome: "failed",
            rowsWritten: 0,
            error: message,
          });
          // Fail loudly and leave the previous measurement in place; a stale
          // measured margin is honest, a guessed one is not.
          return Response.json({ error: message }, { status: 502 });
        }

      },
    },
  },
});
