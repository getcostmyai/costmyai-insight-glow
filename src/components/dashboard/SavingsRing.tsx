import { usd } from "@/lib/dashboard-data";

interface Props {
  captured: number;
  available: number;
}

/** Apple-style progress ring: how much of the identified saving is actually captured. */
export function SavingsRing({ captured, available }: Props) {
  const total = captured + available;
  const pct = total > 0 ? captured / total : 0;
  const size = 240;
  const stroke = 18;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="ringCaptured" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="oklch(0.72 0.16 158)" />
            <stop offset="100%" stopColor="oklch(0.52 0.13 165)" />
          </linearGradient>
          <linearGradient id="ringAvailable" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="oklch(0.82 0.15 82)" />
            <stop offset="100%" stopColor="oklch(0.66 0.16 55)" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="oklch(1 0 0 / 0.12)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#ringAvailable)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * (1 - pct) - 10} ${c}`}
          strokeDashoffset={-(c * pct + 5)}
        />

        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#ringCaptured)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          style={{ transition: "stroke-dasharray 1.2s cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="eyebrow">Captured</span>
        <span className="num text-5xl text-saving">{Math.round(pct * 100)}%</span>
        <span className="mt-1 text-xs text-muted-foreground">
          {usd(captured, 0)} of {usd(total, 0)}
        </span>
      </div>
    </div>
  );
}
