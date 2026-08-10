import { usd } from "@/lib/dashboard-data";

/**
 * The rings.
 *
 * There is more than one true ratio on this dashboard and they are not
 * interchangeable, so each level owns the one it can actually defend:
 *
 *  - Compare and Certify measure *opportunity against spend* — the money one
 *    specific check found, over the spend it was found in. Neither level can
 *    execute anything, so a "captured" ratio there would be answering a
 *    question the page has no right to ask.
 *  - Rightsize measures capture across every check, which is the figure that
 *    level is actually responsible for.
 *  - Govern measures only what ran unattended, against what it is allowed to
 *    run unattended. That numerator is a genuinely different quantity.
 *
 * They share a drawing primitive and nothing else. Props are never passed
 * between pages.
 */

const SIZE = 240;
const STROKE = 18;
const R = (SIZE - STROKE) / 2;
const C = Math.round(2 * Math.PI * R * 100) / 100;

function RingBase({
  /** 0..1, already rounded to a stable precision by the caller. */
  pct,
  children,
}: {
  pct: number;
  children: React.ReactNode;
}) {
  return (
    <div className="relative mx-auto" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} className="-rotate-90">
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
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="oklch(1 0 0 / 0.12)"
          strokeWidth={STROKE}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="url(#ringAvailable)"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${C * (1 - pct) - 10} ${C}`}
          strokeDashoffset={-(C * pct + 5)}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="url(#ringCaptured)"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${C * pct} ${C}`}
          style={{ transition: "stroke-dasharray 1.2s cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
        {children}
      </div>
    </div>
  );
}

/**
 * Rounded before it reaches the DOM: the raw ratio carries float noise that
 * differs by a fraction between the server render and the client, which React
 * reports as a hydration mismatch. Four decimals is far below one pixel here.
 */
const ratio = (part: number, whole: number) =>
  whole > 0 ? Math.round(Math.min(1, Math.max(0, part / whole)) * 10_000) / 10_000 : 0;

interface SavingsRingProps {
  captured: number;
  available: number;
  /** The window both figures were measured over, e.g. "last 7 days". */
  period?: string;
  /** What the numerator is. Defaults to the cross-check capture rate. */
  label?: string;
}

/** How much of the identified saving is actually captured. Rightsize and Overview. */
export function SavingsRing({ captured, available, period, label = "Captured" }: SavingsRingProps) {
  const total = captured + available;
  const pct = ratio(captured, total);

  return (
    <RingBase pct={pct}>
      <span className="eyebrow">{label}</span>
      <span className="num text-5xl text-saving">{Math.round(pct * 100)}%</span>
      <span className="mt-1 text-xs text-muted-foreground">
        {usd(captured, 0)} of {usd(total, 0)}
      </span>
      {period ? <span className="mt-0.5 text-[11px] text-muted-foreground/70">{period}</span> : null}
    </RingBase>
  );
}

interface OpportunityRingProps {
  /** Real dollars this level's own check found over the window. */
  saving: number;
  /** Spend the check ran over, same window. */
  spend: number;
  period?: string;
  /** What the numerator is, e.g. "Cheaper hosts". */
  label: string;
}

/**
 * Opportunity against spend. Compare and Certify.
 *
 * The dollar figure sits directly under the percentage because the percentage
 * alone is the part nobody can act on — the money is the claim.
 */
export function OpportunityRing({ saving, spend, period, label }: OpportunityRingProps) {
  const pct = ratio(saving, spend);

  return (
    <RingBase pct={pct}>
      <span className="eyebrow">{label}</span>
      <span className="num text-5xl text-saving">{Math.round(pct * 100)}%</span>
      <span className="num mt-1 text-lg text-white/90">{usd(saving, 0)}</span>
      <span className="mt-1 text-xs text-muted-foreground">of {usd(spend, 0)} spend</span>
      {period ? <span className="mt-0.5 text-[11px] text-muted-foreground/70">{period}</span> : null}
    </RingBase>
  );
}
