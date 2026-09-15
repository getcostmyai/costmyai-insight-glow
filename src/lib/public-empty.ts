/**
 * Empty results for public reads.
 *
 * These are what a page renders when the database cannot be reached. Every
 * figure is absent or zero-length and `degraded` is set, so the page can say
 * plainly that the live figures are temporarily unavailable. Nothing in here is
 * an estimate, a placeholder or a remembered value: the product's whole claim
 * is that it never shows a number it cannot stand behind.
 *
 * Client-safe on purpose. Route files import it directly, so it must never pull
 * a `.server` module into the browser graph; the type imports below are
 * type-only and erased at build time.
 */

import type { CatalogPayload } from "./catalog/catalog.server";
import type { IntelligencePayload } from "./intelligence/intelligence.server";
import type { PartnerLadder } from "./partner-tiers";

export const EMPTY_CATALOG: CatalogPayload = {
  rows: [],
  vendors: [],
  providers: [],
  live: false,
  degraded: true,
};

export const EMPTY_PARTNER_LADDER: PartnerLadder = {
  tiers: [],
  minRatePct: null,
  maxRatePct: null,
  degraded: true,
};

/** Month labels are derived from the clock, not from data, so they stay honest. */
export function emptyIntelligence(now: Date = new Date()): IntelligencePayload {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return {
    generatedAt: now.toISOString(),
    monthStart: monthStart.toISOString(),
    monthLabel: monthStart.toLocaleString("en-GB", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
    trackingSince: null,
    liveModels: 0,
    liveHosts: 0,
    changesTotal: 0,
    increases: 0,
    decreases: 0,
    newListings: 0,
    newModels: 0,
    topIncreases: [],
    topDecreases: [],
    repricers: [],
    spreads: [],
    multiHostModels: 0,
    medianHostsPerModel: 0,
    maxHostsPerModel: 0,
    hostBuckets: [],
    bandWinners: [],
    saturation: [],
    degraded: true,
  };
}
