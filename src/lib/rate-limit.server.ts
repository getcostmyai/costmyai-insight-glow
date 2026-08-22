/**
 * Shared rate limiter for the unauthenticated surface.
 *
 * Why a table and not an in-process Map: server functions and public routes run
 * on stateless workers. A `Map` counts one isolate's traffic, so the effective
 * ceiling is "limit × however many isolates happen to be warm" — which is not a
 * ceiling at all. Cloudflare-native primitives (KV, Durable Objects) are not
 * reachable on this hosting, so Postgres — the one durable store this stack
 * actually owns — holds the counters. `rate_limit_consume` advances the window
 * inside a single INSERT ... ON CONFLICT, so concurrent workers contend on one
 * row lock and share one count.
 *
 * Failure policy: fail-open. Every endpoint behind this limiter also needs the
 * database to do its actual job, so a limiter outage that returned 429 would
 * turn a degraded backend into a hard outage without protecting anything.
 */

export interface RateVerdict {
  ok: boolean;
  limit: number;
  remaining: number;
  retryAfterSec: number;
}

export interface RateRule {
  /** Namespace for the bucket key — keeps endpoints from sharing a budget. */
  name: string;
  limit: number;
  windowSec: number;
}

/**
 * Limits are sized against plausible legitimate use, not round numbers:
 *
 * - `estimator`: a real visitor tries a handful of scenarios while reading the
 *   page. 15 in 5 minutes covers heavy fiddling; a script amplifying catalogue
 *   reads plus a lead-event write is stopped in seconds.
 * - `estimator-telemetry`: view/engage fire on mount and on interaction, so the
 *   honest rate is several per minute across tabs. 60 in 5 minutes is generous
 *   for a person and still bounds the write path.
 * - `partner-application`: a human applies once. 3 per hour absorbs a
 *   double-submit or a genuine correction; nothing legitimate needs more, and
 *   each accepted call sends a real email.
 * - `ingest`: keyed per workspace, never globally, so one noisy customer cannot
 *   starve the rest. 600 batches/minute is far above a normal middleware flush
 *   cadence and still bounds the rollup re-derivation behind it.
 * - `widget-doc` / `widget-data`: unchanged from the previous in-memory
 *   ceiling (60/min per caller) — now actually enforced across instances.
 */
export const RATE_RULES = {
  estimator: { name: "estimator", limit: 15, windowSec: 300 },
  estimatorTelemetry: { name: "estimator-telemetry", limit: 60, windowSec: 300 },
  partnerApplication: { name: "partner-application", limit: 3, windowSec: 3600 },
  /**
   * Partner funnel telemetry: at most four events per real pass (page view,
   * apply start, two step completions). 40 per 5 minutes absorbs back-and-forth
   * through the steps and several page loads, and bounds the write path the
   * same way the estimator's own telemetry ceiling does.
   */
  partnerTelemetry: { name: "partner-telemetry", limit: 40, windowSec: 300 },
  ingest: { name: "ingest", limit: 600, windowSec: 60 },
  widgetDoc: { name: "widget-doc", limit: 60, windowSec: 60 },
  widgetData: { name: "widget-data", limit: 60, windowSec: 60 },
  /**
   * Dispatch 236. One classification per proxied request that the local rules
   * abstained on, so the ceiling tracks ingest's 600/min rather than a UI rule.
   * Deliberately lower: every call past this one costs real model spend
   * (~$0.16/1k), and the failure mode of hitting it is an abstention the ladder
   * already handles, not a dropped event.
   */
  classify: { name: "classify", limit: 300, windowSec: 60 },
  /** One acceptance record per signup; 10/hour absorbs retries, nothing more. */
  consent: { name: "consent", limit: 10, windowSec: 3600 },
  /**
   * Intelligence share clicks. A reader who shares several cards from one
   * report is normal; 60 per 5 minutes matches the estimator's telemetry
   * ceiling and bounds the write path the same way.
   */
  intelligenceTelemetry: { name: "intelligence-telemetry", limit: 60, windowSec: 300 },
} as const satisfies Record<string, RateRule>;

const allow = (rule: RateRule): RateVerdict => ({
  ok: true,
  limit: rule.limit,
  remaining: rule.limit,
  retryAfterSec: 0,
});

/** Consume one hit for `identity` under `rule`. Never throws. */
export async function consumeRateLimit(rule: RateRule, identity: string): Promise<RateVerdict> {
  const key = `${rule.name}:${identity}`.slice(0, 200);
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("rate_limit_consume", {
      _key: key,
      _limit: rule.limit,
      _window_seconds: rule.windowSec,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return allow(rule);
    return {
      ok: Boolean(row.allowed),
      limit: rule.limit,
      remaining: Number(row.remaining ?? 0),
      retryAfterSec: Number(row.retry_after_sec ?? rule.windowSec),
    };
  } catch (err) {
    console.error("rate limiter unavailable", err instanceof Error ? err.message : String(err));
    return allow(rule);
  }
}

/** Standard headers so callers can back off before they get refused. */
export function rateLimitHeaders(v: RateVerdict, windowSec: number): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(v.limit),
    "X-RateLimit-Remaining": String(Math.max(0, v.remaining)),
    "X-RateLimit-Window": `${windowSec}s`,
  };
}

/**
 * Caller identity for anonymous traffic: the client IP, falling back to the
 * requesting origin. Deliberately coarse — this bounds abuse, it does not
 * identify anyone, and nothing is stored beyond a hashed-shaped bucket key.
 */
export function callerIdentity(request: Request): string {
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "";
  if (ip) return ip;
  const origin = request.headers.get("origin") ?? request.headers.get("referer") ?? "";
  try {
    return origin ? new URL(origin).host : "unknown";
  } catch {
    return "unknown";
  }
}

/** Thrown by server functions when a caller is over its ceiling. */
export class RateLimitedError extends Error {
  readonly retryAfterSec: number;
  constructor(retryAfterSec: number) {
    super(
      `Too many requests. Try again in ${retryAfterSec < 60 ? `${retryAfterSec} seconds` : `${Math.ceil(retryAfterSec / 60)} minutes`}.`,
    );
    this.name = "RateLimitedError";
    this.retryAfterSec = retryAfterSec;
  }
}

/** Consume a hit and throw when refused — the shape server functions want. */
export async function enforceRateLimit(rule: RateRule, identity: string): Promise<void> {
  const verdict = await consumeRateLimit(rule, identity);
  if (!verdict.ok) throw new RateLimitedError(verdict.retryAfterSec);
}
