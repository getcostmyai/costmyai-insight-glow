import { createPublicServerClient } from "./supabase-public.server";

/**
 * The commission ladder, read from the same `partner_tiers` table the payout
 * engine prices commission against (`partner_commission_rate`). The public
 * partner page never restates these numbers in copy — if the ladder changes in
 * the database, the marketing page changes with it.
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

/** "$0", "$5K", "$130K", "$1.2M" — compact, never serif, never hardcoded. */
export function formatThreshold(usd: number): string {
  if (usd <= 0) return "$0";
  if (usd >= 1_000_000) return `$${trim(usd / 1_000_000)}M`;
  if (usd >= 1_000) return `$${trim(usd / 1_000)}K`;
  return `$${trim(usd)}`;
}

function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}

/** "15%" / "17.5%" — no trailing zeros on whole rates. */
export function formatRate(pct: number): string {
  return `${trim(pct)}%`;
}

/** "15–35%", or a single rate when the ladder has one rung. */
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

export async function readPartnerLadder(): Promise<PartnerLadder> {
  const supabase = createPublicServerClient();
  const { data, error } = await supabase
    .from("partner_tiers")
    .select("tier, name, min_lifetime_referred_usd, rate_pct")
    .order("tier", { ascending: true });

  // An unreachable ladder renders as no ladder — the page never falls back to
  // remembered numbers, because a stale rate is a false promise of payment.
  if (error || !data) return toLadder([]);

  return toLadder(
    data.map((r) => ({
      tier: Number(r.tier),
      name: r.name,
      minLifetimeUsd: Number(r.min_lifetime_referred_usd),
      ratePct: Number(r.rate_pct),
    })),
  );
}
