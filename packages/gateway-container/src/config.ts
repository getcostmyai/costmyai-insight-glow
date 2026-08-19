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
  ROUTE_KEY_ENV_PREFIX,
  ROLLING_WINDOW_DAYS,
  TASK_HINTS,
  UNKNOWN_TASK_HINT,
} from "../../../src/lib/ingest/contract.js";
export type { ParseStatus, TaskHint } from "../../../src/lib/ingest/contract.js";

import { CONTAINER_DEFAULTS, ROUTE_KEY_ENV_PREFIX } from "../../../src/lib/ingest/contract.js";

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
  /**
   * Dispatch 231. Destination providers this container has been GRANTED a
   * credential for, keyed by canonical host — read from
   * `COSTMYAI_ROUTE_KEY_<PROVIDER>`.
   *
   * The contract has declared this prefix since Dispatch 155
   * (`src/lib/ingest/contract.ts`), the dashboard copy tells customers to set
   * it, and the server gates Phase 2 on the grant — but no line of container
   * code had ever read the variable, so setting it did nothing at all. A
   * customer following the instructions exactly would wait forever for a gate
   * that could not move.
   *
   * The value stays here, in the customer's own process. It is never logged,
   * never spooled and never sent to CostMyAI; only the HOST NAMES are asserted
   * upstream, which is the whole of what a grant means.
   */
  routeKeys: Record<string, string>;
  /** Opaque label for the grant assertion. Never a credential. */
  containerId: string | null;
  /**
   * Dispatch 232. Opt-in: read request bodies locally to derive a task label.
   * Off by default. When off, this container's posture is byte-identical to
   * every one shipped before — the classifier is never called, and unlabelled
   * traffic stays honestly `unknown`.
   *
   * When on, the reading happens here, in the customer's own process. No
   * prompt text is spooled, logged or sent to CostMyAI; there is no field in
   * the ingest contract that could carry any.
   */
  classifyLocal: boolean;
}




/**
 * `COSTMYAI_ROUTE_KEY_TOGETHER` grants `together`; `..._AI21_LABS` grants
 * `ai21-labs`. Underscores become hyphens because that is how the plan spells
 * a multi-word host key, and a grant that does not match the plan's spelling
 * is a grant the gate can never see.
 */
export function routeKeysFrom(env: Record<string, string | undefined>): Record<string, string> {
  const keys: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith(ROUTE_KEY_ENV_PREFIX)) continue;
    const host = name.slice(ROUTE_KEY_ENV_PREFIX.length).toLowerCase().replace(/_/g, "-");
    const trimmed = (value ?? "").trim();
    if (!host || !trimmed) continue;
    keys[host] = trimmed;
  }
  return keys;
}

function intFrom(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/**
 * A privacy-affecting flag is opt-in on an explicit affirmative only. Anything
 * else — unset, empty, "0", "off", a typo — reads as OFF, because the failure
 * mode of a mis-parsed truthy string here is reading content the customer did
 * not agree to have read.
 */
function boolFrom(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase());
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
    routeKeys: routeKeysFrom(env),
    containerId: env["COSTMYAI_CONTAINER_ID"]?.trim() || null,
    spoolMaxItems: 10_000,
    spoolMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
  };
}
