import { createFileRoute } from "@tanstack/react-router";

import { ingestBatchSchema } from "@/lib/ingest/schema";

/**
 * Metadata ingest.
 *
 * Public prefix because customer middleware calls it directly; every request is
 * authenticated by workspace API key before anything is read from the body.
 * The payload is metadata only — the schema is strict, so a body carrying
 * prompt or completion text is rejected rather than trimmed.
 */
export const Route = createFileRoute("/api/public/ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const header = request.headers.get("authorization") ?? "";
        const rawKey = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

        const { authenticateApiKey, ingestEvents } = await import("@/lib/ingest/ingest.server");
        const authed = await authenticateApiKey(rawKey);
        if (!authed) return new Response("Unauthorized", { status: 401 });

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Body must be JSON" }, { status: 400 });
        }

        const parsed = ingestBatchSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            { error: "Invalid payload", detail: parsed.error.issues.slice(0, 5) },
            { status: 422 },
          );
        }

        try {
          const result = await ingestEvents(authed.orgId, parsed.data.events);
          return Response.json(result);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("ingest failed", message);
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
