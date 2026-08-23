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
    <section className="border-y border-border wash-brand bg-card">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-6 sm:px-8">
        <h2 className="text-center text-base font-semibold tracking-[-0.02em] sm:text-lg">
          Works with your AI ecosystem.
        </h2>

        <div className="marquee-mask relative min-w-0 overflow-hidden">
          <div className="flex w-max animate-marquee items-center gap-10 pr-10">
            {lane.map((name, i) => (
              <ProviderLogo key={`${name}-${i}`} label={name} size={22} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

