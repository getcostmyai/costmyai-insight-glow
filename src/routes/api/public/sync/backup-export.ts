import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

/**
 * Scheduled off-platform export.
 *
 * Runs every 6 hours into the independent Neon project costmyai-dr-backup, beating the platform's own ~24h daily snapshot cadence,
 * and retains history through Neon branching, far beyond the platform's ~14 day window. This is the only
 * backup path for this project that can be restored independently and verified
 * without destroying production, so it is treated as the primary safety net.
 */
export const Route = createFileRoute("/api/public/sync/backup-export")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.SYNC_CRON_SECRET;
        if (!expected) return new Response("Backup export is not configured", { status: 503 });

        const provided = request.headers.get("x-sync-secret") ?? "";
        const a = Buffer.from(provided);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { runBackupExport } = await import("@/lib/backup/export.server");
        const { recordRun } = await import("@/lib/engine/evaluate.server");
        const started = new Date();

        // Dispatch 88. The export has always written its own detailed row to
        // backup_export_runs; it now also reports into the one ledger every job
        // is judged from, so a backup that silently stops firing shows up in the
        // same place as a collector that does.
        try {
          const result = await runBackupExport();
          const statements = result.statements ?? 0;
          await recordRun({
            job: "dr-backup-export",
            started,
            outcome: result.ok && statements > 0 ? "ok" : result.ok ? "empty" : "failed",
            rowsWritten: statements,
            detail: {
              destination: result.destination,
              bytes: result.bytes,
              countsMatch: result.countsMatch,
              triggersOk: result.triggersOk,
            },
            error: result.error,
          });
          return Response.json(result, { status: result.ok ? 200 : 500 });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("backup export failed", message);
          await recordRun({
            job: "dr-backup-export",
            started,
            outcome: "failed",
            rowsWritten: 0,
            error: message,
          });
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
