/**
 * The ingest contract — one place, shared by the server routes, the customer
 * container and the tests.
 *
 * The container never hardcodes a path: it reads them from here (mirrored into
 * its own config constant), and a test asserts these paths resolve to real
 * route files. A silently renamed route is how an integration starts dropping
 * a customer's traffic without anyone noticing.
 */

/**
 * Payload contract version.
 *
 * Dispatch 155 raises this to 2 for the rerouting fields below. Both versions
 * are accepted for the whole rollout and a v1 batch keeps byte-for-byte the
 * semantics it had before: an older container in the field must not start
 * failing because a newer one exists. There is no cut-over date because there
 * is no way to make a stranger restart their container on our schedule.
 */
export const INGEST_API_VERSION = 2 as const;

/** Every version the endpoint still accepts. Never shrinks without a real plan. */
export const SUPPORTED_INGEST_API_VERSIONS = [1, 2] as const;
export type IngestApiVersion = (typeof SUPPORTED_INGEST_API_VERSIONS)[number];

/**
 * The env-var prefix a customer uses to grant one container a credential for a
 * destination provider — e.g. `COSTMYAI_ROUTE_KEY_TOGETHER`.
 *
 * Dispatch 155 scopes a previously absolute rule (DECISIONS.md §1-2): the
 * container holds no credential for pass-through traffic, ever, and holds one
 * only for a destination the customer separately and explicitly granted. The
 * value stays in the customer's own infrastructure; it is never sent here, and
 * there is no field anywhere in this contract that could carry it.
 */
export const ROUTE_KEY_ENV_PREFIX = "COSTMYAI_ROUTE_KEY_";

export const INGEST_PATHS = {
  events: "/api/public/v1/events",
  billing: "/api/public/v1/billing",
  /**
   * The switch plan (Dispatch 155, Stage 2). GET returns active switches with
   * server-resolved match keys; POST asserts which destinations this container
   * holds a customer-granted key for. Same token as ingest.
   */
  switches: "/api/public/v1/switches",
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
  image: "ghcr.io/getcostmyai/gateway",
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
  /**
   * Where a customer's container delivers metadata.
   *
   * Dispatch 124: this read `https://app.costmyai.com`, which has no DNS
   * record at all. Every quickstart, README and generated `docker run` named a
   * hostname that resolves nowhere, so a stranger's very first container could
   * never deliver a single event — it would spool to disk forever and look
   * "fine" in `docker logs`. Nothing caught it because every internal test
   * pointed the container at a local server.
   *
   * This is now the stable production URL, which is immutable across project
   * renames and is the address external callers are supposed to use. When
   * `app.costmyai.com` is actually pointed at this deployment, change this one
   * constant — every surface re-renders from it, and
   * `scripts/audit/onboarding.ts` re-proves that the new value really answers.
   */
  appUrl: "https://project--e64eb6e2-38b5-4107-b0fb-2e2b0ab7a1d4.lovable.app",
} as const;

export function containerImageRef(): string {
  return `${CONTAINER_DEFAULTS.image}:${CONTAINER_DEFAULTS.tag}`;
}

/**
 * One container fronts one provider, and the SDK base URL a customer sets is
 * NOT the same string for every provider — OpenAI clients append their own
 * paths under `/v1`, Anthropic clients append `/v1/messages` to a bare origin,
 * and Groq's OpenAI-compatible surface lives under `/openai/v1`. Getting this
 * wrong is a 404 from the provider that looks like a broken proxy, so the
 * quickstart renders the right pairing per provider instead of one example
 * the reader has to generalise from.
 *
 * `port` differs per preset so a customer running two providers side by side
 * can paste both commands without a port collision.
 */
export interface ProviderPreset {
  id: string;
  label: string;
  /** What the container proxies to. */
  upstream: string;
  /** Suggested host port for this container. */
  port: number;
  /** The env var the customer's SDK reads. */
  sdkEnv: string;
  /** Path suffix appended to the container origin for that SDK. */
  sdkPath: string;
  /** A real call that proves the path end to end. */
  verifyPath: string;
}

export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  {
    id: "openai",
    label: "OpenAI",
    upstream: "https://api.openai.com",
    port: 8787,
    sdkEnv: "OPENAI_BASE_URL",
    sdkPath: "/v1",
    verifyPath: "/v1/chat/completions",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    upstream: "https://api.anthropic.com",
    port: 8788,
    sdkEnv: "ANTHROPIC_BASE_URL",
    sdkPath: "",
    verifyPath: "/v1/messages",
  },
  {
    id: "google",
    label: "Google Gemini",
    upstream: "https://generativelanguage.googleapis.com",
    port: 8789,
    sdkEnv: "GOOGLE_GEMINI_BASE_URL",
    sdkPath: "",
    verifyPath: "/v1beta/models/gemini-2.5-flash:generateContent",
  },
  {
    id: "openai-compatible",
    label: "Groq / Together / Fireworks / Mistral / xAI / vLLM",
    upstream: "https://api.groq.com",
    port: 8790,
    sdkEnv: "OPENAI_BASE_URL",
    sdkPath: "/openai/v1",
    verifyPath: "/openai/v1/chat/completions",
  },
] as const;

export function sdkBaseUrl(preset: ProviderPreset, host = "localhost"): string {
  return `http://${host}:${preset.port}${preset.sdkPath}`;
}

/** The exact `docker run` a customer copies. One renderer, every call site. */
export function dockerRunSnippet(
  token: string,
  upstreamUrl = "https://api.openai.com",
  options: { name?: string; port?: number } = {},
): string {
  const e = CONTAINER_DEFAULTS.env;
  const port = options.port ?? CONTAINER_DEFAULTS.port;
  const name = options.name ?? "costmyai";
  return [
    `docker run -d --name ${name} --restart unless-stopped \\`,
    `  -e ${e.token}=${token} \\`,
    `  -e ${e.baseUrl}=${CONTAINER_DEFAULTS.appUrl} \\`,
    `  -e ${e.upstream}=${upstreamUrl} \\`,
    `  -v ${name}-spool:${CONTAINER_DEFAULTS.spoolDir} \\`,
    `  -p ${port}:${CONTAINER_DEFAULTS.port} \\`,
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
