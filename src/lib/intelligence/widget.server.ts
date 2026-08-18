import { readIntelligence, type IntelligencePayload } from "./intelligence.server";

/**
 * Embeddable widget read model.
 *
 * This surface is unauthenticated and, by design, lives on pages we do not
 * control. Two consequences shape everything below:
 *
 *  1. It is never live-queried per view. Every embed view is served from a
 *     process-level cache with a short TTL, so a widget that goes viral costs
 *     one catalogue read every {@link WIDGET_CACHE_TTL_MS}, not one per impression.
 *  2. It carries only market-level figures that are already public on the
 *     Intelligence page. No customer, workspace or usage data can reach it.
 *
 * The rotation set is locked to the three "flashiest" stats — the month-over-
 * month move count, the single biggest price rise and the single biggest cut.
 * It is deliberately not configurable by the embedder: nothing the host page
 * supplies selects, filters or labels what gets rendered.
 */

/** Server-side cache window. Also the interval the widget re-polls on. */
export const WIDGET_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * How long a payload that could not be refreshed may still be served.
 *
 * Serving the last good copy through a brief upstream wobble is right; serving
 * it forever, unlabelled, on somebody else's website while our own copy says
 * "refreshed every five minutes" is not. Past this bound the widget stops
 * claiming to know the market and says so.
 */
export const WIDGET_STALE_SERVE_MAX_MS = 60 * 60 * 1000;

/** How long one stat is shown before the widget advances. */
export const WIDGET_ROTATE_MS = 6000;

export type WidgetTone = "brand" | "up" | "down";

export interface WidgetStat {
  /** One of the three locked kinds — used for tests and for the rotation dots. */
  id: "mom-moves" | "top-increase" | "top-decrease";
  value: string;
  label: string;
  detail: string;
  tone: WidgetTone;
}

export interface WidgetPayload {
  month: string;
  generatedAt: string;
  /** Epoch ms this snapshot was computed — lets a client see its own staleness. */
  computedAt: number;
  /**
   * True when this is a last-good copy served after a failed refresh. Rendered,
   * never swallowed: a widget on a third-party page has to be able to say that
   * what it is showing is older than it promises.
   */
  stale?: boolean;
  stats: WidgetStat[];
}

const signedPct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
const usd = (n: number) => (n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(n < 0.01 ? 4 : 3)}`);

function moveDetail(
  kind: "increase" | "decrease",
  month: string,
  prev: number | null,
  now: number | null,
): string {
  const side = kind === "increase" ? "rise" : "cut";
  const from = prev != null ? usd(prev) : "—";
  const to = now != null ? usd(now) : "—";
  return `Largest single provider price ${side} recorded in ${month}: ${from} to ${to} per million input tokens.`;
}

/** Build the locked three-stat rotation from this month's and last month's reads. */
export function buildWidgetStats(
  current: IntelligencePayload,
  previous: IntelligencePayload | null,
): WidgetStat[] {
  const stats: WidgetStat[] = [];

  const prevTotal = previous?.changesTotal ?? null;
  const delta =
    prevTotal != null && prevTotal > 0
      ? ((current.changesTotal - prevTotal) / prevTotal) * 100
      : null;

  stats.push({
    id: "mom-moves",
    value: String(current.changesTotal),
    label: `Price moves in ${current.monthLabel}`,
    detail:
      delta != null
        ? `${current.increases} up, ${current.decreases} down — ${signedPct(delta)} against last month's ${prevTotal}.`
        : `${current.increases} up, ${current.decreases} down, recorded in the append-only price ledger.`,
    tone: "brand",
  });

  const up = current.topIncreases[0];
  if (up) {
    stats.push({
      id: "top-increase",
      value: signedPct(up.pct),
      label: `${up.modelKey} at ${up.hostLabel}`,
      detail: moveDetail("increase", current.monthLabel, up.inputPrev, up.inputNow),
      tone: "up",
    });
  }

  const down = current.topDecreases[0];
  if (down) {
    stats.push({
      id: "top-decrease",
      value: signedPct(down.pct),
      label: `${down.modelKey} at ${down.hostLabel}`,
      detail: moveDetail("decrease", current.monthLabel, down.inputPrev, down.inputNow),
      tone: "down",
    });
  }

  return stats;
}

let cache: { at: number; payload: WidgetPayload } | null = null;
let inflight: Promise<WidgetPayload> | null = null;

async function compute(): Promise<WidgetPayload> {
  const now = new Date();
  const prevStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const [current, previous] = await Promise.all([
    readIntelligence(),
    readIntelligence(prevStart).catch(() => null),
  ]);
  return {
    month: current.monthLabel,
    generatedAt: current.generatedAt,
    computedAt: Date.now(),
    stats: buildWidgetStats(current, previous),
  };
}

/**
 * Cached read. Concurrent misses share one computation, and a failed refresh
 * keeps serving the last good payload rather than showing an error on somebody
 * else's website.
 */
export async function readWidgetPayload(): Promise<WidgetPayload> {
  if (cache && Date.now() - cache.at < WIDGET_CACHE_TTL_MS) return cache.payload;
  if (inflight) return inflight;

  inflight = compute()
    .then((payload) => {
      cache = { at: Date.now(), payload };
      return payload;
    })
    .catch((err) => {
      /*
       * A failed refresh falls back to the last good payload, but only inside a
       * bounded window and only while saying that is what it is. Beyond the
       * window there is no honest fallback left, so the error propagates and
       * the surface renders its unavailable state instead of old figures
       * dressed as current ones.
       */
      if (cache && Date.now() - cache.at <= WIDGET_STALE_SERVE_MAX_MS) {
        return { ...cache.payload, stale: true };
      }
      throw err;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

/* ------------------------------------------------------------------ */
/* Rate limiting                                                       */
/* ------------------------------------------------------------------ */

/**
 * Fixed-window limiter for the unauthenticated embed surface only.
 *
 * This ceiling exists so embed traffic — which anyone can point at us — cannot
 * become a scraping channel or crowd out the authenticated dashboard/API. It is
 * intentionally separate from, and much lower than, any signed-in API budget.
 * State is per server instance; with several instances the effective ceiling is
 * a multiple of this, which is fine for its purpose (a cheap upper bound in
 * front of a cache, not a billing-grade quota).
 */
export const WIDGET_RATE_LIMIT = 60; // requests
export const WIDGET_RATE_WINDOW_MS = 60_000; // per minute, per caller key

const buckets = new Map<string, { count: number; resetAt: number }>();

export interface RateVerdict {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function rateLimit(
  key: string,
  now = Date.now(),
  limit = WIDGET_RATE_LIMIT,
  windowMs = WIDGET_RATE_WINDOW_MS,
): RateVerdict {
  // Opportunistic sweep so an unbounded key space cannot grow the map forever.
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSec: Math.ceil(windowMs / 1000) };
  }

  bucket.count += 1;
  const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  if (bucket.count > limit) return { ok: false, remaining: 0, retryAfterSec };
  return { ok: true, remaining: limit - bucket.count, retryAfterSec };
}

/** Caller identity: the requesting origin when present, else the client IP. */
export function callerKey(request: Request): string {
  const origin = request.headers.get("origin") ?? request.headers.get("referer") ?? "";
  let host = "";
  try {
    if (origin) host = new URL(origin).host;
  } catch {
    host = "";
  }
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  return `${host || "no-origin"}|${ip}`;
}

/** Reset helper for tests. */
export function __resetWidgetState() {
  buckets.clear();
  cache = null;
  inflight = null;
}
