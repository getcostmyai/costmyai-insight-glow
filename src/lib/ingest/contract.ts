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

/** First poll after a provider is connected looks this far back (brief §1). */
export const BACKFILL_LOOKBACK_DAYS = 30;

/** Every subsequent poll only re-reads this much, since invoices settle late. */
export const ROLLING_WINDOW_DAYS = 7;

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
  for (const [fragment, provider] of HOST_TO_PROVIDER) {
    if (normalised.includes(fragment)) return provider;
  }
  return normalised;
}

/** The one key a capture is deduplicated on, everywhere. */
export function captureIdempotencyKey(provider: string, periodStart: string, periodEnd: string): string {
  return `${provider}:${periodStart}:${periodEnd}`;
}
