import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { MAX_CLASSIFY_CHARS } from "@/lib/classify/remote.server";

/**
 * Remote task classification — v1 (Dispatch 236).
 *
 * The container calls this only when its local rules abstained, and only when
 * the operator turned remote classification on. Unlike every other endpoint
 * under this prefix, the body carries real prompt text: that is the whole point
 * of the capability, it is why it ships on a new `v3` image line rather than
 * under `v2`'s "structural shape only" claim, and it is documented as such in
 * the container README, DECISIONS.md §12 and the privacy page.
 *
 * The text is used for one model call and is not persisted here — the only
 * thing that survives the request is the enum the container writes onto its own
 * queued event.
 */

const bodySchema = z
  .object({
    v: z.number().int().optional(),
    text: z.string().min(1).max(MAX_CLASSIFY_CHARS * 2),
    tools_declared: z.boolean().optional(),
    tool_traffic: z.boolean().optional(),
    schema_constrained: z.boolean().optional(),
  })
  .strict();

export const Route = createFileRoute("/api/public/v1/classify")({
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
                "Send a current workspace ingest token as 'Authorization: Bearer <token>'.",
            },
            { status: 401 },
          );
        }

        const { enforceRateLimit, RateLimitedError, RATE_RULES } = await import(
          "@/lib/rate-limit.server"
        );
        try {
          await enforceRateLimit(RATE_RULES.classify, `org:${authed.orgId}`);
        } catch (err) {
          if (err instanceof RateLimitedError) {
            // 429 is not an error the container should retry — it abstains, and
            // the event stays honestly unlabelled.
            return Response.json(
              { error: "rate_limited", detail: err.message },
              { status: 429, headers: { "Retry-After": String(err.retryAfterSec) } },
            );
          }
          throw err;
        }

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return Response.json({ error: "Body must be JSON" }, { status: 400 });
        }

        const parsed = bodySchema.safeParse(raw);
        if (!parsed.success) {
          return Response.json({ error: "invalid_body" }, { status: 400 });
        }

        const { classifyRemoteText } = await import("@/lib/classify/remote.server");
        const result = await classifyRemoteText({
          text: parsed.data.text,
          toolsDeclared: parsed.data.tools_declared,
          toolTraffic: parsed.data.tool_traffic,
          schemaConstrained: parsed.data.schema_constrained,
        });

        return Response.json(result);
      },
    },
  },
});
