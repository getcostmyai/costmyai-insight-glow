import { createPublicServerClient } from "./supabase-public.server";
import { toLadder, type PartnerLadder } from "./partner-tiers";

/**
 * The commission ladder, read from the same `partner_tiers` table the payout
 * engine prices commission against (`partner_commission_rate`). The public
 * partner page never restates these numbers in copy — if the ladder changes in
 * the database, the marketing page changes with it.
 */
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
