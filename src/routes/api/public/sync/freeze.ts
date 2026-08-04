import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

/**
 * Month-close freeze.
 *
 * Called at 00:00 UTC on the 1st. It writes the closing month's final KPI
 * payload once; a second call in the same month is a no-op rather than an edit,
 * because frozen history is append-only. A correction is an explicit restate,
 * which files a NEW row referencing the original — never an overwrite.
 */
export const Route = createFileRoute("/api/public/sync/freeze")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.SYNC_CRON_SECRET;
        if (!expected) return new Response("Freeze is not configured", { status: 503 });

        const provided = request.headers.get("x-sync-secret") ?? "";
        const a = Buffer.from(provided);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const body = (await request.json().catch(() => ({}))) as {
          month?: string;
          restate?: boolean;
          note?: string;
        };

        const { freezeMonth, previousMonthKey } = await import(
          "@/lib/intelligence/snapshot.server"
        );
        const { recordRun } = await import("@/lib/engine/evaluate.server");
        const started = new Date();
        const month = body.month ?? previousMonthKey();

        try {
          const result = await freezeMonth(month, {
            restate: body.restate === true,
            note: body.note,
          });
          /*
           * Dispatch 88. A freeze that finds the month already frozen wrote
           * nothing on purpose — that is `quiet`, not a hole. Only a first-time
           * freeze is expected to produce a row.
           */
          const wrote = (result as { frozen?: boolean }).frozen === false ? 0 : 1;
          await recordRun({
            job: "freeze-intelligence",
            started,
            outcome: wrote > 0 ? "ok" : "quiet",
            rowsWritten: wrote,
            detail: { month, restate: body.restate === true },
          });
          return Response.json(result);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("month freeze failed", message);
          await recordRun({
            job: "freeze-intelligence",
            started,
            outcome: "failed",
            rowsWritten: 0,
            error: message,
            detail: { month },
          });
          return Response.json({ error: message, month }, { status: 400 });
        }
      },
    },
  },
});
