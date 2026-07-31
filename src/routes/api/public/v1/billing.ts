import { createFileRoute } from "@tanstack/react-router";

import { billingBatchSchema } from "@/lib/ingest/schema";

/**
 * Billing capture ingest — v1.
 *
 * Customer-pushed only: the container reads the invoice with the customer's own
 * credentials, in their environment, and pushes the total here. We never hold a
 * provider key, so there is nothing in this contract that could carry one.
 *
 * Idempotent on (org, provider, period_start, period_end) — a reconnect or a
 * re-run of the 30-day first-connection backfill updates the same rows instead
 * of double-counting a month.
 */
export const Route = createFileRoute("/api/public/v1/billing")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const header = request.headers.get("authorization") ?? "";
        const rawKey = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

        const { authenticateApiKey } = await import("@/lib/ingest/ingest.server");
        const authed = await authenticateApiKey(rawKey);
        if (!authed) {
          return Response.json(
            {
              error: "Unauthorized",
              detail:
                "Send a current workspace ingest token as 'Authorization: Bearer <token>'. A rotated or revoked token stops working immediately — generate a new one in Settings and restart the container.",
            },
            { status: 401 },
          );
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Body must be JSON" }, { status: 400 });
        }

        const parsed = billingBatchSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            { error: "Invalid payload", detail: parsed.error.issues.slice(0, 5) },
            { status: 422 },
          );
        }

        try {
          const { ingestBillingCaptures } = await import("@/lib/ingest/billing.server");
          const result = await ingestBillingCaptures(authed.orgId, parsed.data.captures);
          return Response.json({ backfill: parsed.data.backfill, ...result });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("billing ingest failed", message);
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
