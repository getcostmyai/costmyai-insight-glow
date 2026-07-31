/**
 * Pure shaping/formatting for the commission ladder. Client-safe: the numbers
 * themselves always come from `partner_tiers` in the database, never from here.
 */
export interface PartnerTierRow {
  tier: number;
  name: string;
  minLifetimeUsd: number;
  ratePct: number;
}

export interface PartnerLadder {
  tiers: PartnerTierRow[];
  /** Lowest rate on the ladder, e.g. 15. */
  minRatePct: number | null;
  /** Highest rate on the ladder, e.g. 35. */
  maxRatePct: number | null;
}

function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}

/** "$0", "$5K", "$130K", "$1.2M" — compact, never hardcoded. */
export function formatThreshold(usd: number): string {
  if (usd <= 0) return "$0";
  if (usd >= 1_000_000) return `$${trim(usd / 1_000_000)}M`;
  if (usd >= 1_000) return `$${trim(usd / 1_000)}K`;
  return `$${trim(usd)}`;
}

/** "15%" / "17.5%" — no trailing zeros on whole rates. */
export function formatRate(pct: number): string {
  return `${trim(pct)}%`;
}

/** "15–35%", or a single rate when the ladder has one level, null when empty. */
export function formatRateRange(ladder: PartnerLadder): string | null {
  if (ladder.minRatePct === null || ladder.maxRatePct === null) return null;
  if (ladder.minRatePct === ladder.maxRatePct) return formatRate(ladder.minRatePct);
  return `${trim(ladder.minRatePct)}–${trim(ladder.maxRatePct)}%`;
}

export function toLadder(rows: PartnerTierRow[]): PartnerLadder {
  const tiers = [...rows].sort((a, b) => a.tier - b.tier);
  const rates = tiers.map((t) => t.ratePct);
  return {
    tiers,
    minRatePct: rates.length ? Math.min(...rates) : null,
    maxRatePct: rates.length ? Math.max(...rates) : null,
  };
}
