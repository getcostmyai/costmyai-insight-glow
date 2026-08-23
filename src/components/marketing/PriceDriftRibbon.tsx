import { useEffect, useId, useMemo, useRef, useState } from "react";

/**
 * The mid-page artwork: price drift, drawn.
 *
 * This is deliberately NOT presented as a chart of specific prices — we do not
 * publish a per-model price series on the marketing site, and drawing one from
 * invented numbers would be a lie in the one place the page argues for honesty.
 * What it *is* is a truthful abstraction: a band of many overlapping paths that
 * never settles, sized by the one real figure we do publish, the number of
 * market price moves observed this month. The label says exactly that.
 *
 * Deterministic: a fixed seed, so server and client render byte-identical paths
 * and hydration never mismatches.
 */

const WIDTH = 1200;
const HEIGHT = 260;
const POINTS = 26;

/** mulberry32 — small, fast, and stable across runtimes. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A smooth path across the box, wandering around its own centre line. */
function ribbonPath(seed: number, centre: number, amplitude: number) {
  const next = rng(seed);
  const step = WIDTH / (POINTS - 1);
  const ys: number[] = [];
  let y = centre;
  for (let i = 0; i < POINTS; i += 1) {
    // Mean-reverting walk: drifts, but never leaves the band.
    y += (next() - 0.5) * amplitude - (y - centre) * 0.28;
    ys.push(y);
  }
  let d = `M 0 ${ys[0]!.toFixed(2)}`;
  for (let i = 1; i < POINTS; i += 1) {
    const x = i * step;
    const cx = x - step / 2;
    d += ` C ${cx.toFixed(2)} ${ys[i - 1]!.toFixed(2)}, ${cx.toFixed(2)} ${ys[i]!.toFixed(
      2,
    )}, ${x.toFixed(2)} ${ys[i]!.toFixed(2)}`;
  }
  return d;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduced;
}

export type RibbonOrientation = "horizontal" | "vertical" | "diagonal";

export function PriceDriftRibbon({
  moves,
  className = "",
  orientation = "horizontal",
}: {
  /** Real market price moves observed this month. Drives the band's density. */
  moves: number;
  className?: string;
  /** Same band, seen from a different angle. Path maths never changes. */
  orientation?: RibbonOrientation;
}) {
  const reduced = useReducedMotion();
  const hostRef = useRef<HTMLDivElement>(null);
  // One gradient per instance: a shared DOM id would collide across the three
  // placements on the page.
  const gradientId = `driftStroke${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  const lines = useMemo(() => {
    // More observed movement, more strands — bounded so it never turns to mud.
    const count = Math.max(9, Math.min(22, Math.round(moves / 18) + 9));
    return Array.from({ length: count }, (_, i) => {
      const t = count === 1 ? 0.5 : i / (count - 1);
      return {
        d: ribbonPath(1337 + i * 977, HEIGHT * (0.18 + t * 0.64), 34 + t * 26),
        // Rounded: full float precision serialises differently on the server
        // than in the DOM and React reports it as a hydration mismatch.
        opacity: Number((0.16 + Math.sin(t * Math.PI) * 0.5).toFixed(3)),
        width: Number((1 + Math.sin(t * Math.PI) * 1.4).toFixed(2)),
        delay: -(i * 0.9),
      };
    });
  }, [moves]);

  // Rotation happens inside the SVG, so `preserveAspectRatio="none"` still
  // stretches the band to fill whatever box the caller positioned.
  const vertical = orientation === "vertical";
  const viewBox = vertical ? `0 0 ${HEIGHT} ${WIDTH}` : `0 0 ${WIDTH} ${HEIGHT}`;
  const groupTransform = vertical
    ? `rotate(90) translate(0 -${HEIGHT})`
    : orientation === "diagonal"
      ? `translate(${WIDTH / 2} ${HEIGHT / 2}) rotate(-7) scale(1.3) translate(-${WIDTH / 2} -${
          HEIGHT / 2
        })`
      : undefined;

  return (
    <div ref={hostRef} className={`pointer-events-none select-none ${className}`} aria-hidden>
      <svg viewBox={viewBox} preserveAspectRatio="none" className="h-full w-full">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgb(var(--brand-indigo))" stopOpacity="0" />
            <stop offset="18%" stopColor="rgb(var(--brand-indigo))" stopOpacity="1" />
            <stop offset="46%" stopColor="rgb(var(--brand-violet))" stopOpacity="1" />
            <stop offset="72%" stopColor="rgb(var(--brand-magenta))" stopOpacity="1" />
            <stop offset="92%" stopColor="rgb(var(--brand-coral))" stopOpacity="1" />
            <stop offset="100%" stopColor="rgb(var(--brand-amber))" stopOpacity="0" />
          </linearGradient>
        </defs>

        <g transform={groupTransform}>
          {lines.map((l, i) => (
            <path
              key={i}
              d={l.d}
              fill="none"
              stroke={`url(#${gradientId})`}
              strokeWidth={l.width}
              strokeOpacity={l.opacity}
              strokeLinecap="round"
              style={
                reduced
                  ? undefined
                  : {
                      animation: `drift-strand ${22 + (i % 5) * 4}s ease-in-out ${l.delay}s infinite`,
                      transformOrigin: "center",
                    }
              }
            />
          ))}
        </g>
      </svg>

    </div>
  );
}
