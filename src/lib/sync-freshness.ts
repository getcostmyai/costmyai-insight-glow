/**
 * One place that decides how old a feed reading is allowed to be.
 *
 * Until Dispatch 230 "fresh" meant "a sync succeeded at some point in this
 * product's history": the catalogue's pulsing LIVE dot and the homepage
 * marquee both read `Boolean(snapshot.synced_at)`, which stays true forever
 * after the first successful run, and the certification engine read benchmark
 * scores and margins with no age bound at all. Both are claims about a
 * measurement, so both now have to name the window they are true inside.
 *
 * The constants live in one pure module because two surfaces disagreeing about
 * what "live" means is exactly the drift this codebase keeps fixing.
 */

/** `pricing_snapshots.feed` values — the ledger both syncs write to. */
export const PRICING_FEED = "openrouter";
export const BENCHMARK_FEED = "artificial_analysis";

/** Real scheduled cadence, read off `cron.job`, not off documentation. */
export const PRICING_CADENCE_MS = 3 * 60_000;
export const BENCHMARK_CADENCE_MS = 24 * 60 * 60_000;

/**
 * How stale a pricing reading may be before the product stops calling itself
 * live. Twenty missed three-minute cycles: long enough that a single failed or
 * locked run never blinks the badge off, short enough that an hour of silence
 * is never described as a live feed.
 */
export const PRICING_LIVE_MAX_AGE_MS = 20 * PRICING_CADENCE_MS;

/**
 * How stale benchmark evidence may be before certification fails closed.
 *
 * One cadence, not two. The certification frame's own standard is that a
 * number is trusted because of how it was produced, not because it looks
 * plausible; a missed daily sync means today's certification would be defended
 * by yesterday's evidence without saying so. A grace window would be us
 * quietly tolerating exactly the failure this bound exists to catch.
 */
export const BENCHMARK_MAX_AGE_MS = BENCHMARK_CADENCE_MS;

export function ageMs(iso: string | null | undefined, now: number = Date.now()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? Math.max(0, now - t) : null;
}

/** Never-synced is not fresh: absence of a reading is not a fresh reading. */
export function isFresh(
  iso: string | null | undefined,
  maxAgeMs: number,
  now: number = Date.now(),
): boolean {
  const age = ageMs(iso, now);
  return age !== null && age <= maxAgeMs;
}

/** True when the pricing feed may be described as live right now. */
export function pricingIsLive(iso: string | null | undefined, now: number = Date.now()): boolean {
  return isFresh(iso, PRICING_LIVE_MAX_AGE_MS, now);
}

/** True when benchmark evidence is recent enough to certify against. */
export function benchmarksAreCertifiable(
  iso: string | null | undefined,
  now: number = Date.now(),
): boolean {
  return isFresh(iso, BENCHMARK_MAX_AGE_MS, now);
}
