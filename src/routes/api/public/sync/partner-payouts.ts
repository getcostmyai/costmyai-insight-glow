import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

/**
 * Monthly partner payout run.
 *
 * Called at 06:00 UTC on the 1st, after the overnight pricing/benchmark syncs
 * have settled. It walks every partner carrying unpaid commission and calls the
 * same `runPayoutForPartner` path the admin button uses — the automation adds a
 * schedule, it does not add a second way to move money.
 *
 * Eligibility, including the $50 minimum, lives in `payout_begin`. A partner
 * below the floor is skipped with `below_minimum`; the balance stays on the
 * ledger and rides into the next month. Nothing is ever forfeited.
 */
export const Route = createFileRoute("/api/public/sync/partner-payouts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.SYNC_CRON_SECRET;
        if (!expected) return new Response("Payout run is not configured", { status: 503 });

        const provided = request.headers.get("x-sync-secret") ?? "";
        const a = Buffer.from(provided);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { getStripeEnvironment } = await import("@/lib/stripe");
        const { readPayoutQueue, runPayoutForPartner } = await import(
          "@/lib/partners/payouts.server"
        );
        const { recordRun } = await import("@/lib/engine/evaluate.server");
        const started = new Date();

        try {
          const env = getStripeEnvironment();
          const queue = await readPayoutQueue(env);
          const candidates = queue.filter((p) => p.amountUsd > 0);

          const results = [];
          // Sequential on purpose: one transfer at a time reconciles cleanly.
          for (const p of candidates) {
            results.push(await runPayoutForPartner(p.partnerId, env, null));
          }

          const paid = results.filter((r) => r.ok);
          const paidUsd = Math.round(paid.reduce((s, r) => s + (r.amountUsd ?? 0), 0) * 100) / 100;
          const skipped = results
            .filter((r) => !r.ok)
            .map((r) => ({ partner: r.partnerName, reason: r.reason }));

          /*
           * Dispatch 88. Paying nobody is only healthy when nobody was owed
           * enough yet: a month where every partner sits below the $50 floor is
           * `quiet`, while a partner who was eligible and still got nothing is
           * `empty` — a real payout that did not happen, not a slow month.
           */
          const blocked = skipped.filter((s) => s.reason !== "below_minimum");
          const outcome =
            paid.length > 0 ? "ok" : blocked.length > 0 ? "empty" : "quiet";

          await recordRun({
            job: "partner-payouts",
            started,
            outcome,
            rowsWritten: paid.length,
            detail: { environment: env, considered: candidates.length, paidUsd, skipped },
          });

          return Response.json({
            environment: env,
            considered: candidates.length,
            paid: paid.length,
            paidUsd,
            skipped,
            results,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("partner payout run failed", message);
          await recordRun({
            job: "partner-payouts",
            started,
            outcome: "failed",
            rowsWritten: 0,
            error: message,
          });
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
