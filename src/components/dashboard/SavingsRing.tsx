import { usd } from "@/lib/dashboard-data";

interface Props {
  captured: number;
  available: number;
  /** The window both figures were measured over, e.g. "last 7 days". */
  period?: string;
}

/** Apple-style progress ring: how much of the identified saving is actually captured. */
export function SavingsRing({ captured, available, period }: Props) {
  const total = captured + available;
  // Rounded before it reaches the DOM: the raw ratio carries float noise that
  // differs by a fraction between the server render and the client, which React
  // reports as a hydration mismatch. Two decimals is far below one pixel here.
  const pct = total > 0 ? Math.round((captured / total) * 10_000) / 10_000 : 0;
  const size = 240;
  const stroke = 18;
  const r = (size - stroke) / 2;
  const c = Math.round(2 * Math.PI * r * 100) / 100;

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="ringCaptured" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="oklch(0.72 0.16 158)" />
            <stop offset="100%" stopColor="oklch(0.52 0.13 165)" />
          </linearGradient>
          <linearGradient id="ringAvailable" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="oklch(0.78 0.11 195)" />
            <stop offset="100%" stopColor="oklch(0.58 0.12 200)" />
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
        {period ? (
          <span className="mt-0.5 text-[11px] text-muted-foreground/70">{period}</span>
        ) : null}
      </div>
    </div>
  );
}
