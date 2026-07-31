/**
 * Endpoint configuration for the CostMyAI gateway container.
 *
 * Paths live in exactly one place — mirrored from `src/lib/ingest/contract.ts`
 * and asserted equal by `configured-paths-match-live-routes` in the test suite.
 * The container never hardcodes a route anywhere else.
 */
export {
  BACKFILL_LOOKBACK_DAYS,
  captureIdempotencyKey,
  INGEST_API_VERSION,
  INGEST_PATHS,
  MAX_CAPTURES_PER_BATCH,
  MAX_EVENTS_PER_BATCH,
  providerForHost,
  ROLLING_WINDOW_DAYS,
} from "../../../src/lib/ingest/contract";

export interface ContainerConfig {
  /** Where CostMyAI lives. Overridable for self-hosted or staging targets. */
  baseUrl: string;
  /** The workspace ingest token, from the dashboard. Never a provider key. */
  ingestToken: string;
  /** Local spool directory used when CostMyAI is unreachable. */
  spoolDir: string;
  /** How often metadata is flushed upstream. */
  flushIntervalMs: number;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): ContainerConfig {
  const ingestToken = env.COSTMYAI_INGEST_TOKEN;
  if (!ingestToken) {
    throw new Error(
      "COSTMYAI_INGEST_TOKEN is not set. Generate an ingest token in the CostMyAI dashboard (Settings → Ingest tokens) and pass it to the container.",
    );
  }
  return {
    baseUrl: (env.COSTMYAI_BASE_URL ?? "https://app.costmyai.com").replace(/\/+$/, ""),
    ingestToken,
    spoolDir: env.COSTMYAI_SPOOL_DIR ?? "/var/lib/costmyai/spool",
    flushIntervalMs: Number(env.COSTMYAI_FLUSH_INTERVAL_MS ?? 30_000),
  };
}
