import { ProviderLogo } from "@/components/marketing/ProviderLogo";
import { CountUp } from "@/components/marketing/Reveal";
import type { MarketingStats } from "@/lib/marketing.functions";

/**
 * Provider strip.
 *
 * Only providers we hold a real, verified price row for are rendered — a logo
 * with no catalog entry behind it would be a coverage claim we cannot back. The
 * whole strip is gated on a pricing sync having actually completed, so "Live"
 * is never shown over stale-or-never-synced data (Clause 10).
 *
 * The three coverage numbers live inside the strip rather than beside it: they
 * describe the same live feed the logos come from, so they carry the same
 * blinking live dot as the hero badge.
 */
function LiveStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="inline-flex items-baseline gap-2">
        <CountUp
          value={value}
          format={(n) => Math.round(n).toLocaleString("en-US")}
          className="num text-xl font-semibold leading-none text-gradient-brand sm:text-2xl"
        />
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-saving animate-pulse-dot" />
          Live
        </span>
      </span>
      <span className="whitespace-nowrap text-[11px] leading-tight text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

export function ProviderMarquee({ stats }: { stats: MarketingStats }) {
  if (!stats.live || stats.providers.length === 0) return null;

  const lane = [...stats.providers, ...stats.providers];

  return (
    <section className="border-y border-border bg-card">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-4 sm:px-8">
        <div className="flex items-center justify-center">
          <LiveStat value={stats.providerCount} label="Providers priced, synced continuously" />
        </div>


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
