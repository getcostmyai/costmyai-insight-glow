import type { BandWinner, HostBucket, SaturationRow } from "@/lib/intelligence/intelligence.server";

/* ---------------------------------------------------------------------------
 * Price-moves donut. Same visual language as the dashboard's Captured/Available
 * ring (SavingsRing): one thick stroked circle, gapped arcs, figure in the well.
 * ------------------------------------------------------------------------- */

const MOVE_ARCS = [
  { key: "decreases", label: "Decreases", stroke: "url(#donutDown)" },
  { key: "increases", label: "Increases", stroke: "url(#donutUp)" },
  { key: "newListings", label: "New listings", stroke: "url(#donutNew)" },
] as const;

export function PriceMovesDonut({
  increases,
  decreases,
  newListings,
  monthLabel,
}: {
  increases: number;
  decreases: number;
  newListings: number;
  monthLabel: string;
}) {
  const values = { increases, decreases, newListings };
  const total = increases + decreases + newListings;
  const size = 240;
  const stroke = 18;
  const r = (size - stroke) / 2;
  const c = Math.round(2 * Math.PI * r * 100) / 100;

  let cursor = 0;
  const arcs = MOVE_ARCS.map((a) => {
    const v = values[a.key];
    const frac = total > 0 ? Math.round((v / total) * 10_000) / 10_000 : 0;
    const offset = cursor;
    cursor += frac;
    return { ...a, value: v, frac, offset };
  });

  return (
    <div className="flex flex-col items-center gap-8 sm:flex-row sm:gap-12">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <defs>
            <linearGradient id="donutDown" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="oklch(0.72 0.16 158)" />
              <stop offset="100%" stopColor="oklch(0.52 0.13 165)" />
            </linearGradient>
            <linearGradient id="donutUp" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="oklch(0.68 0.19 25)" />
              <stop offset="100%" stopColor="oklch(0.55 0.18 22)" />
            </linearGradient>
            <linearGradient id="donutNew" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="oklch(0.72 0.15 295)" />
              <stop offset="100%" stopColor="oklch(0.55 0.17 292)" />
            </linearGradient>
          </defs>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="color-mix(in oklab, var(--foreground) 10%, transparent)"
            strokeWidth={stroke}
          />
          {arcs.map((a) =>
            a.frac > 0 ? (
              <circle
                key={a.key}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={a.stroke}
                strokeWidth={stroke}
                strokeLinecap="butt"
                strokeDasharray={`${Math.max(0, c * a.frac - 4)} ${c}`}
                strokeDashoffset={-(c * a.offset + 2)}
                style={{ transition: "stroke-dasharray 1.2s cubic-bezier(0.22,1,0.36,1)" }}
              />
            ) : null,
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="num text-5xl font-semibold tabular-nums tracking-[-0.04em]">
            {increases + decreases}
          </span>
          <span className="mt-2 text-[0.7rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            price moves
          </span>
          <span className="mt-1 text-xs text-muted-foreground/70">{monthLabel}</span>
        </div>
      </div>

      <ul className="w-full max-w-xs space-y-4">
        {arcs.map((a) => (
          <li key={a.key} className="flex items-baseline justify-between gap-4">
            <span className="flex items-center gap-3 text-sm text-muted-foreground">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{
                  background:
                    a.key === "decreases"
                      ? "oklch(0.66 0.15 160)"
                      : a.key === "increases"
                        ? "oklch(0.62 0.19 24)"
                        : "oklch(0.64 0.16 293)",
                }}
              />
              {a.label}
            </span>
            <span className="num text-2xl font-semibold tabular-nums tracking-tight">{a.value}</span>
          </li>
        ))}
        <li className="border-t border-border/60 pt-4 text-xs leading-relaxed text-muted-foreground/80">
          Total moves counts increases plus decreases only. New listings are shown here for context
          and are never folded into that total.
        </li>
      </ul>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Market-structure histogram: models per provider-count bucket.
 * ------------------------------------------------------------------------- */

export function HostHistogram({ buckets }: { buckets: HostBucket[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.models));
  const totalModels = buckets.reduce((s, b) => s + b.models, 0);
  return (
    <div>
      <div className="flex h-56 items-end gap-4 sm:gap-8">
        {buckets.map((b) => {
          const h = (b.models / max) * 100;
          const share = totalModels > 0 ? (b.models / totalModels) * 100 : 0;
          return (
            <div key={b.label} className="flex h-full flex-1 flex-col justify-end">
              <span className="num mb-3 text-center text-lg font-semibold tabular-nums tracking-tight">
                {b.models}
              </span>
              <div
                className="w-full rounded-t-md bg-gradient-to-t from-primary/25 to-primary"
                style={{
                  height: `${Math.max(h, b.models > 0 ? 2 : 0.5)}%`,
                  transition: "height 1.1s cubic-bezier(0.22,1,0.36,1)",
                }}
              />
              <span className="mt-3 text-center text-[0.7rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {b.label}
              </span>
              <span className="mt-1 text-center text-[0.7rem] tabular-nums text-muted-foreground/70">
                {share.toFixed(0)}%
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
        Providers per model, across {totalModels.toLocaleString("en-GB")} models with at least one
        real (non-aggregator) endpoint. Most weights are single-sourced; a small tail is served
        everywhere — and that tail is where the spread lives.
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Equivalence-band diagram: leader score, measured margin below it, and where
 * the cheapest qualifying model actually sits inside that band.
 * ------------------------------------------------------------------------- */

export function BandDiagram({ winner }: { winner: BandWinner }) {
  const pad = winner.margin * 1.4 || 1;
  const lo = Math.max(0, winner.bar - pad);
  const hi = winner.topScore + pad * 0.35;
  const span = hi - lo || 1;
  const x = (v: number) => `${((v - lo) / span) * 100}%`;

  return (
    <div className="mt-6">
      <div className="relative h-16">
        {/* full scale hairline */}
        <div className="absolute inset-x-0 top-8 h-px bg-border" />
        {/* the equivalence band */}
        <div
          className="absolute top-4 h-9 rounded-md bg-primary/12 ring-1 ring-inset ring-primary/30"
          style={{ left: x(winner.bar), width: `${((winner.topScore - winner.bar) / span) * 100}%` }}
        />
        {/* bar (threshold) */}
        <div className="absolute top-2 h-13" style={{ left: x(winner.bar) }}>
          <div className="h-13 w-px bg-primary" />
        </div>
        {/* leader */}
        <div className="absolute top-2" style={{ left: x(winner.topScore) }}>
          <div className="h-13 w-px bg-foreground/60" />
        </div>
        {/* winner marker */}
        <div
          className="absolute top-[1.55rem] -ml-[7px] h-3.5 w-3.5 rounded-full bg-saving ring-4 ring-background"
          style={{ left: x(winner.score) }}
        />
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-6 gap-y-2 text-[0.7rem] text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-saving" />
          cheapest qualifying {winner.score.toFixed(2)}
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2 w-px bg-primary" />
          bar {winner.bar.toFixed(2)}
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2 w-px bg-foreground/60" />
          leader {winner.topScore.toFixed(2)}
        </span>
        <span>band width ±{winner.margin.toFixed(2)} (measured margin)</span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Saturation gauge: ratio against the 1.0x saturation threshold.
 * ------------------------------------------------------------------------- */

export function SaturationGauge({ row }: { row: SaturationRow }) {
  const size = 132;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  // 240° sweep, starting bottom-left.
  const START = 150;
  const SWEEP = 240;
  const MAX = 6;
  const clamped = Math.min(row.ratio, MAX);
  const polar = (deg: number, radius = r) => {
    const rad = (deg * Math.PI) / 180;
    return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)];
  };
  const arc = (fromDeg: number, toDeg: number) => {
    const [x1, y1] = polar(fromDeg);
    const [x2, y2] = polar(toDeg);
    const large = toDeg - fromDeg > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  };
  const angleFor = (ratio: number) => START + (Math.min(ratio, MAX) / MAX) * SWEEP;
  const [nx, ny] = polar(angleFor(clamped), r);
  const safe = row.ratio > 1;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <path
          d={arc(START, START + SWEEP)}
          fill="none"
          stroke="color-mix(in oklab, var(--foreground) 10%, transparent)"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        <path
          d={arc(angleFor(0.02), angleFor(clamped))}
          fill="none"
          stroke={safe ? "oklch(0.66 0.15 160)" : "oklch(0.62 0.19 24)"}
          strokeWidth={stroke}
          strokeLinecap="round"
          style={{ transition: "d 1s cubic-bezier(0.22,1,0.36,1)" }}
        />
        {/* saturation floor: the 0–1.0x zone stays visible on top of the value arc */}
        <path
          d={arc(START, angleFor(1))}
          fill="none"
          stroke="oklch(0.62 0.19 24)"
          strokeWidth={3}
          strokeLinecap="round"
        />
        <circle cx={nx} cy={ny} r={5} fill="var(--background)" stroke="currentColor" strokeWidth={2} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span
          className={`num text-2xl font-semibold tabular-nums tracking-tight ${
            safe ? "text-saving" : "text-destructive"
          }`}
        >
          {row.ratio.toFixed(2)}×
        </span>
        <span className="text-[0.6rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          vs 1.0× floor
        </span>
      </div>
    </div>
  );
}
