import { createFileRoute } from "@tanstack/react-router";
import { createHash, randomUUID } from "crypto";
import { z } from "zod";

/**
 * Gateway metadata ingest — ported from the pre-migration codebase.
 *
 * A customer's local gateway-container proxy POSTs one event per proxied
 * request. Events land in the separate LEDGER database, never in MAIN; MAIN
 * is touched only to authenticate the token and resolve the org's synthetic
 * flag.
 *
 * In LEDGER, `customer_id` carries the MAIN organization id — an org, not a
 * user. This differs from the old pre-migration system's per-user model.
 *
 * Explicitly out of scope: any validation or join against routing_rules
 * (deferred), and any billing/raw-capture/adapter ingest (separate route).
 */

const ingestSchema = z
  .object({
    model: z.string().max(128),
    host: z.string().max(64),
    endpointType: z.enum(["chat", "completion", "embedding", "other"]),
    inputTokens: z.number().nullable(),
    inputBytes: z.number().nullable(),
    outputTokens: z.number().nullable(),
    outputBytes: z.number().nullable(),
    latencyMs: z.number(),
    httpStatus: z.number().min(100).max(599),
    ts: z.number().int(),
    taskShape: z.object({
      hasTools: z.boolean(),
      streaming: z.boolean(),
      maxTokens: z.number().nullable(),
      temperature: z.number().nullable(),
    }),
    routingRuleId: z.string().max(128).nullable().optional(),
  })
  .strict();

export const Route = createFileRoute("/api/public/gateway/ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // --- Auth: Bearer cgw_<token>, SHA-256 matched against api_keys ---
        const header = request.headers.get("authorization") ?? "";
        const match = /^Bearer (cgw_[A-Za-z0-9_-]+)$/.exec(header);
        if (!match) return new Response("Unauthorized", { status: 401 });

        const keyHash = createHash("sha256").update(match[1]).digest("hex");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: keyRow, error: keyError } = await supabaseAdmin
          .from("api_keys")
          .select("id, org_id, revoked_at")
          .eq("key_hash", keyHash)
          .maybeSingle();
        if (keyError || !keyRow || keyRow.revoked_at !== null) {
          return new Response("Unauthorized", { status: 401 });
        }
        const orgId = keyRow.org_id;

        // Fire-and-forget: last_used_at must never block or fail the ingest.
        void supabaseAdmin
          .from("api_keys")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", keyRow.id)
          .then(({ error }) => {
            if (error) console.warn("gateway ingest: last_used_at update failed", error.message);
          });

        // --- Body validation: strict, reject anything unlisted ---
        let body: z.infer<typeof ingestSchema>;
        try {
          body = ingestSchema.parse(await request.json());
        } catch {
          return new Response("Invalid request body", { status: 400 });
        }

        // --- Resolve the synthetic flag from MAIN's organizations table ---
        const { data: org, error: orgError } = await supabaseAdmin
          .from("organizations")
          .select("is_synthetic")
          .eq("id", orgId)
          .maybeSingle();
        // An api_keys row pointing at a missing org is a data-integrity
        // problem, not a valid request — refuse rather than write a
        // null-flagged event.
        if (orgError || !org) return new Response("Unknown organization", { status: 400 });

        // --- Write the event to LEDGER (never MAIN) ---
        const { ledgerDb, gatewayEvents, syntheticTenantRegistry } = await import(
          "@/lib/ledger/ledger-client.server"
        );
        const db = ledgerDb();

        await db.insert(gatewayEvents).values({
          id: randomUUID(),
          customerId: orgId,
          model: body.model,
          host: body.host,
          endpointType: body.endpointType,
          inputTokens: body.inputTokens,
          inputBytes: body.inputBytes,
          outputTokens: body.outputTokens,
          outputBytes: body.outputBytes,
          latencyMs: body.latencyMs,
          httpStatus: body.httpStatus,
          taskHasTools: body.taskShape.hasTools,
          taskStreaming: body.taskShape.streaming,
          taskMaxTokens: body.taskShape.maxTokens,
          // Stored as text to match the numeric column's string encoding.
          taskTemperature: body.taskShape.temperature === null ? null : String(body.taskShape.temperature),
          eventTs: new Date(body.ts * 1000),
          ingestedAt: new Date(),
          isSynthetic: org.is_synthetic,
          // TODO: no confirmed current-schema source for is_test parity with
          // the old system's test_customer_registry — defaults false pending
          // that resolution.
          isTest: false,
          // Stored as-is; routing_rules validation is explicitly out of scope.
          routingRuleId: body.routingRuleId ?? null,
        });

        // Non-fatal registry upsert — matches the exclusion pattern used
        // elsewhere in the LEDGER schema. A failure here never fails ingest.
        try {
          await db
            .insert(syntheticTenantRegistry)
            .values({ customerId: orgId, registeredAt: new Date() })
            .onConflictDoNothing();
        } catch (err) {
          console.warn("gateway ingest: synthetic_tenant_registry upsert failed", err);
        }

        return Response.json({ ok: true });
      },
    },
  },
});
