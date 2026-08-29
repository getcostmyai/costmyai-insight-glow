import { drizzle, type NeonDatabase } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { pgTable, uuid, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

/**
 * LEDGER database client.
 *
 * LEDGER is a separate Postgres (Neon) from this app's main database. Nothing
 * in MAIN may be written from a ledger code path, and nothing in LEDGER is
 * read by customer-facing surfaces — it is the raw event store the gateway
 * ingest writes to.
 *
 * The Neon HTTP driver is deliberate: this app runs on an edge runtime where
 * a long-lived TCP pool (node-postgres) is not safe. Each query is a single
 * stateless HTTPS round trip, so there is no socket lifecycle to manage.
 *
 * Note on identity: in this ported system, LEDGER's `customer_id` means the
 * MAIN organization id, not an individual user. That differs from the old
 * pre-migration system's per-user model.
 */

export const gatewayEvents = pgTable("gateway_events", {
  id: uuid("id").primaryKey(),
  customerId: uuid("customer_id").notNull(),
  model: text("model"),
  host: text("host"),
  endpointType: text("endpoint_type"),
  inputTokens: integer("input_tokens"),
  inputBytes: integer("input_bytes"),
  outputTokens: integer("output_tokens"),
  outputBytes: integer("output_bytes"),
  latencyMs: integer("latency_ms"),
  httpStatus: integer("http_status"),
  taskHasTools: boolean("task_has_tools"),
  taskStreaming: boolean("task_streaming"),
  taskMaxTokens: integer("task_max_tokens"),
  taskTemperature: text("task_temperature"),
  eventTs: timestamp("event_ts", { withTimezone: true }),
  ingestedAt: timestamp("ingested_at", { withTimezone: true }),
  isSynthetic: boolean("is_synthetic"),
  isTest: boolean("is_test"),
  routingRuleId: text("routing_rule_id"),
});

export const syntheticTenantRegistry = pgTable("synthetic_tenant_registry", {
  customerId: uuid("customer_id").primaryKey(),
  registeredAt: timestamp("registered_at", { withTimezone: true }),
});

let ledger: NeonDatabase | null = null;

/**
 * Lazy singleton — the connection string is read per-process, never at module
 * scope, because env is injected at request time on the edge runtime.
 */
export function ledgerDb(): NeonDatabase {
  if (!ledger) {
    const url = process.env.LEDGER_DATABASE_URL;
    if (!url) throw new Error("LEDGER_DATABASE_URL is not configured");
    ledger = drizzle(neon(url));
  }
  return ledger;
}
