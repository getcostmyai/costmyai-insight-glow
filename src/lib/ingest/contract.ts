/**
 * The ingest contract — one place, shared by the server routes, the customer
 * container and the tests.
 *
 * The container never hardcodes a path: it reads them from here (mirrored into
 * its own config constant), and a test asserts these paths resolve to real
 * route files. A silently renamed route is how an integration starts dropping
 * a customer's traffic without anyone noticing.
 */

/** Payload contract version. Bumped only on a breaking change of the body shape. */
export const INGEST_API_VERSION = 1 as const;

export const INGEST_PATHS = {
  events: "/api/public/v1/events",
  billing: "/api/public/v1/billing",
} as const;

/** Batch caps. A push above these is rejected, never silently truncated. */
export const MAX_EVENTS_PER_BATCH = 1000;
export const MAX_CAPTURES_PER_BATCH = 100;

/**
 * Task labels a real event may carry.
 *
 * `unknown` exists because of Dispatch 99: every task label the product had
 * ever seen was authored by the synthetic generator. Real traffic arrives
 * unlabelled, and the connector will not invent one — a coarse label is derived
 * from the endpoint path and the model family only, never from prompt or
 * response content, and anything it cannot place stays `unknown`. An unknown
 * cohort walks the same ladder as everything else and refuses honestly, which
 * is the only correct answer for work nobody has measured.
 */
export const TASK_HINTS = ["generation", "code", "classification", "unknown"] as const;
export type TaskHint = (typeof TASK_HINTS)[number];
export const UNKNOWN_TASK_HINT: TaskHint = "unknown";

/**
 * How completely the connector could read a response envelope.
 *
 * `parsed`      — token counts read from a shape we know.
 * `tokens_only` — tokens found heuristically, envelope otherwise unrecognised.
 * `unparsed`    — nothing readable; the event is still reported, with identity,
 *                 timestamp and status, rather than vanishing (Dispatch 95/96,
 *                 one layer up the stack).
 */
export const PARSE_STATUSES = ["parsed", "tokens_only", "unparsed"] as const;
export type ParseStatus = (typeof PARSE_STATUSES)[number];

/**
 * The one description of how the container is actually run.
 *
 * The Settings quickstart and the package README both render from this, and a
 * test asserts they do — the two used to disagree on the env var name, the
 * port and the image, and the copy a real customer pastes was the wrong one.
 */
export const CONTAINER_DEFAULTS = {
  image: "ghcr.io/costmyai/gateway",
  tag: "v1",
  port: 8787,
  spoolDir: "/var/lib/costmyai/spool",
  spoolVolume: "costmyai-spool",
  env: {
    token: "COSTMYAI_INGEST_TOKEN",
    baseUrl: "COSTMYAI_BASE_URL",
    upstream: "COSTMYAI_UPSTREAM_URL",
    spoolDir: "COSTMYAI_SPOOL_DIR",
    flushInterval: "COSTMYAI_FLUSH_INTERVAL_MS",
    upstreamTimeout: "COSTMYAI_UPSTREAM_TIMEOUT_MS",
    port: "COSTMYAI_PORT",
  },
  appUrl: "https://app.costmyai.com",
} as const;

export function containerImageRef(): string {
  return `${CONTAINER_DEFAULTS.image}:${CONTAINER_DEFAULTS.tag}`;
}

/** The exact `docker run` a customer copies. One renderer, two call sites. */
export function dockerRunSnippet(token: string, upstreamUrl = "https://api.openai.com"): string {
  const e = CONTAINER_DEFAULTS.env;
  return [
    "docker run -d --name costmyai \\",
    `  -e ${e.token}=${token} \\`,
    `  -e ${e.baseUrl}=${CONTAINER_DEFAULTS.appUrl} \\`,
    `  -e ${e.upstream}=${upstreamUrl} \\`,
    `  -v ${CONTAINER_DEFAULTS.spoolVolume}:${CONTAINER_DEFAULTS.spoolDir} \\`,
    `  -p ${CONTAINER_DEFAULTS.port}:${CONTAINER_DEFAULTS.port} \\`,
    `  ${containerImageRef()}`,
  ].join("\n");
}


/** First poll after a provider is connected looks this far back (brief §1). */
export const BACKFILL_LOOKBACK_DAYS = 30;

/**
 * How often the Verification Engine polls a connected provider's invoices.
 *
 * One global cadence, deliberately: per-provider cadence and per-source
 * freshness disclosure are deferred, not built.
 *
 * Tuned to 1 hour against real provider billing latency (Bible §21.5):
 * Anthropic's Cost API refreshes in ~5 minutes and permits per-minute polling;
 * OpenAI reports tens of minutes to hours; Google Cloud billing can lag a day
 * or more no matter how often it is asked. 1h is the middle ground — much
 * tighter than the arbitrary 6h for the fast providers, without meaningful
 * extra volume against the slow ones.
 *
 * Locked here rather than in the container, because the container is the thing
 * that has not shipped yet: the loop that reads this constant lands with the
 * published package, and this way the interval is already correct when it does
 * instead of being invented at packaging time. Nothing in this repo schedules
 * it — the poll runs inside the customer's own container, on their side of the
 * zero-credentials boundary, and our pg_cron schedules deliberately cannot
 * reach it.
 */
export const BILLING_POLL_INTERVAL_MS = 60 * 60 * 1000;


/**
 * Every subsequent poll only re-reads this much, since invoices settle late.
 * 3 days matches the original system; captures are idempotent on
 * (org, provider, period_start, period_end), so a wider window buys overlap
 * margin we don't need and re-reads settled invoices for nothing.
 */
export const ROLLING_WINDOW_DAYS = 3;

/** Anything inside this band is measurement noise, not a pricing disagreement. */
export const RECONCILIATION_TOLERANCE_PCT = 2;

export type ReconciliationVerdict = "match" | "under_estimated" | "over_estimated";

/**
 * Providers we know how to attribute hosts to. Anything unknown reconciles
 * under its own hostname rather than being dropped or guessed into a bucket.
 */
export const PROVIDER_HOSTS: Record<string, string[]> = {
  openai: ["api.openai.com", "openai"],
  azure: ["azure", "openai.azure.com"],
  anthropic: ["api.anthropic.com"],
  google: ["generativelanguage.googleapis.com", "aiplatform.googleapis.com"],
  alibaba: ["dashscope.aliyuncs.com"],
  deepinfra: ["api.deepinfra.com"],
  venice: ["api.venice.ai"],
  groq: ["api.groq.com"],
  together: ["api.together.xyz"],
  fireworks: ["api.fireworks.ai"],
  ionstream: ["api.ionstream.ai"],
};

const HOST_TO_PROVIDER = new Map<string, string>();
for (const [provider, hosts] of Object.entries(PROVIDER_HOSTS)) {
  for (const host of hosts) HOST_TO_PROVIDER.set(host, provider);
}

/** Which invoice a host's spend belongs to. Unknown hosts stay themselves. */
export function providerForHost(host: string): string {
  const normalised = host.trim().toLowerCase();
  const direct = HOST_TO_PROVIDER.get(normalised);
  if (direct) return direct;
  // Longest fragment first: "openai.azure.com" must beat the bare "openai".
  const fragments = [...HOST_TO_PROVIDER.keys()].sort((a, b) => b.length - a.length);
  for (const fragment of fragments) {
    if (normalised.includes(fragment)) return HOST_TO_PROVIDER.get(fragment)!;
  }
  return normalised;
}

/** The one key a capture is deduplicated on, everywhere. */
export function captureIdempotencyKey(provider: string, periodStart: string, periodEnd: string): string {
  return `${provider}:${periodStart}:${periodEnd}`;
}
