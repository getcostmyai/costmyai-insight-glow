import { ProviderLogo } from "@/components/marketing/ProviderLogo";
import type { MarketingStats } from "@/lib/marketing.functions";

/**
 * Provider strip.
 *
 * Only providers we hold a real, verified price row for are rendered — a logo
 * with no catalog entry behind it would be a coverage claim we cannot back. The
 * whole strip is gated on a pricing sync having actually completed, so "Live"
 * is never shown over stale-or-never-synced data (Clause 10).
 */
export function ProviderMarquee({ stats }: { stats: MarketingStats }) {
  if (!stats.live || stats.providers.length === 0) return null;

  const lane = [...stats.providers, ...stats.providers];

  return (
    <section className="overflow-hidden border-y border-border bg-card py-10">
      <p className="mb-7 flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-saving animate-pulse-dot" />
        Pricing tracked across <span className="num font-semibold text-foreground">{stats.modelCount}</span>{" "}
        models · <span className="num font-semibold text-foreground">{stats.providerCount}</span>{" "}
        providers live
      </p>

      <div className="marquee-mask relative">
        <div className="flex w-max animate-marquee items-center gap-12 pr-12">
          {lane.map((name, i) => (
            <ProviderLogo key={`${name}-${i}`} label={name} />
          ))}
        </div>
      </div>
    </section>
  );
}
