import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

/**
 * Scheduled off-platform export.
 *
 * Runs every 6 hours, beating the platform's own ~24h daily snapshot cadence,
 * and keeps 90 days, far beyond the platform's ~14 day window. This is the only
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
        const result = await runBackupExport();
        return Response.json(result, { status: result.ok ? 200 : 500 });
      },
    },
  },
});
