/**
 * Endpoint and runtime configuration for the CostMyAI gateway container.
 *
 * Paths, versions and the documented `docker run` all live in exactly one
 * place — mirrored from `src/lib/ingest/contract.ts` and asserted equal by the
 * connector test suite. The container never hardcodes a route, a port or an
 * env var name anywhere else, because the Settings page and this README used
 * to disagree and the copy a real customer pasted was the wrong one.
 */
export {
  BACKFILL_LOOKBACK_DAYS,
  captureIdempotencyKey,
  CONTAINER_DEFAULTS,
  containerImageRef,
  dockerRunSnippet,
  INGEST_API_VERSION,
  INGEST_PATHS,
  MAX_CAPTURES_PER_BATCH,
  MAX_EVENTS_PER_BATCH,
  PARSE_STATUSES,
  providerForHost,
  ROLLING_WINDOW_DAYS,
  TASK_HINTS,
  UNKNOWN_TASK_HINT,
} from "../../../src/lib/ingest/contract.js";
export type { ParseStatus, TaskHint } from "../../../src/lib/ingest/contract.js";

import { CONTAINER_DEFAULTS } from "../../../src/lib/ingest/contract.js";

export interface ContainerConfig {
  /** Where CostMyAI lives. Overridable for self-hosted or staging targets. */
  baseUrl: string;
  /** The workspace ingest token, from the dashboard. Never a provider key. */
  ingestToken: string;
  /** The provider this instance fronts, e.g. https://api.openai.com. */
  upstreamUrl: string;
  /** Local spool directory used when CostMyAI is unreachable. */
  spoolDir: string;
  /** How often metadata is flushed upstream. */
  flushIntervalMs: number;
  /** Bound on waiting for provider response headers. Never retried on expiry. */
  upstreamTimeoutMs: number;
  /** Port the proxy listens on. */
  port: number;
  /** Spool bounds — a CostMyAI outage must not fill the customer's disk. */
  spoolMaxItems: number;
  spoolMaxAgeMs: number;
  /** How often the switch plan is polled. Never on the request path. */
  switchPollIntervalMs: number;
}

function intFrom(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): ContainerConfig {
  const e = CONTAINER_DEFAULTS.env;
  const ingestToken = env[e.token];
  if (!ingestToken) {
    throw new Error(
      `${e.token} is not set. Generate an ingest token in the CostMyAI dashboard (Settings → Ingest tokens) and pass it to the container.`,
    );
  }
  const upstreamUrl = env[e.upstream];
  if (!upstreamUrl) {
    throw new Error(
      `${e.upstream} is not set. Point it at the provider this instance should front, e.g. ${e.upstream}=https://api.openai.com. Run one container per upstream.`,
    );
  }
  return {
    baseUrl: (env[e.baseUrl] ?? CONTAINER_DEFAULTS.appUrl).replace(/\/+$/, ""),
    ingestToken,
    upstreamUrl: upstreamUrl.replace(/\/+$/, ""),
    spoolDir: env[e.spoolDir] ?? CONTAINER_DEFAULTS.spoolDir,
    flushIntervalMs: intFrom(env[e.flushInterval], 30_000),
    upstreamTimeoutMs: intFrom(env[e.upstreamTimeout], 120_000),
    port: intFrom(env[e.port], CONTAINER_DEFAULTS.port),
    switchPollIntervalMs: 60_000,
    spoolMaxItems: 10_000,
    spoolMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
  };
}
