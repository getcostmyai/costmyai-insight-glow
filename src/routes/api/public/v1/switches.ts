import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Switch plan — the container's control channel (Dispatch 155, Stage 2).
 *
 * GET  returns this workspace's active switches with server-resolved match
 *      keys, gate state and executability. Read-only, and deliberately the
 *      only thing the container ever asks us: it polls this on an interval and
 *      serves the answer from memory, so a request the customer's application
 *      makes never waits on CostMyAI being reachable.
 *
 * POST records which destinations this container now holds a customer-granted
 *      key for. The key itself never arrives — the schema is strict and there
 *      is no field that could carry one.
 *
 * Same authentication as ingest: a hashed, workspace-scoped token. An unknown
 * or revoked token gets 401 and learns nothing about the workspace.
 */

const grantAssertionSchema = z
  .object({
    v: z.union([z.literal(1), z.literal(2)]).default(2),
    /** Canonical destination host keys, as emitted by the plan. */
    hosts: z.array(z.string().min(1).max(120)).min(1).max(50),
    /** Which container asserted it. An opaque label, never a credential. */
    container_id: z.string().min(1).max(120).nullable().optional(),
  })
  .strict();

function unauthorized() {
  return Response.json(
    {
      error: "Unauthorized",
      detail:
        "Send a current workspace ingest token as 'Authorization: Bearer <token>'. A rotated or revoked token stops working immediately — generate a new one in Settings and restart the container.",
    },
    { status: 401 },
  );
}

function bearer(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

export const Route = createFileRoute("/api/public/v1/switches")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { authenticateApiKey } = await import("@/lib/ingest/ingest.server");
        const authed = await authenticateApiKey(bearer(request));
        if (!authed) return unauthorized();

        try {
          const { buildSwitchPlan } = await import("@/lib/ingest/switch-plan.server");
          return Response.json(await buildSwitchPlan(authed.orgId), {
            headers: { "cache-control": "no-store" },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("switch plan failed", message);
          return Response.json({ error: message }, { status: 500 });
        }
      },

      POST: async ({ request }) => {
        const { authenticateApiKey } = await import("@/lib/ingest/ingest.server");
        const authed = await authenticateApiKey(bearer(request));
        if (!authed) return unauthorized();

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Body must be JSON" }, { status: 400 });
        }

        const parsed = grantAssertionSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            { error: "Invalid payload", detail: parsed.error.issues.slice(0, 5) },
            { status: 422 },
          );
        }

        try {
          const { assertRoutingGrants } = await import("@/lib/ingest/routing.server");
          const grants = await assertRoutingGrants(
            authed.orgId,
            parsed.data.hosts,
            parsed.data.container_id ?? null,
          );
          return Response.json({ granted: grants.map((g) => g.host) });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("routing grant assertion failed", message);
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
