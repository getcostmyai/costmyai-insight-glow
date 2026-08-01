import { useEffect, useRef, useState } from "react";

import { Reveal } from "@/components/marketing/Reveal";

/**
 * A read-only visual of how a month-end forecast is built.
 *
 * It shows the split between what is already known (month-to-date, solid),
 * what is projected from the trailing pattern (dashed), and the honest
 * range that becomes the final forecast. No weights or coefficients are
 * exposed — only the shape of the mechanism.
 */

const DAYS = 30;
const TODAY = 18;

// Synthetic daily spend curve: low start, mid-month bump, trailing pattern.
const ACTUAL_DAILY = [
  120, 115, 132, 128, 145, 138, 110, 122, 130, 155, 148, 162, 170, 158, 149, 165, 172, 180,
];
const PROJECTED_DAILY = [168, 175, 162, 158, 170, 165, 172, 168, 175, 180, 185, 178];

const ACTUAL_CUMULATIVE = ACTUAL_DAILY.reduce<number[]>(
  (acc, v) => [...acc, (acc.at(-1) ?? 0) + v],
  [],
);
const LAST_KNOWN_CUMULATIVE = ACTUAL_CUMULATIVE.at(-1) ?? 0;
const PROJECTED_CUMULATIVE = PROJECTED_DAILY.reduce<number[]>(
  (acc, v, i) => [...acc, (i === 0 ? LAST_KNOWN_CUMULATIVE : acc.at(-1) ?? 0) + v],
  [],
);
const FORECAST_POINT = PROJECTED_CUMULATIVE.at(-1) ?? 0;
const FORECAST_RANGE = [FORECAST_POINT * 0.955, FORECAST_POINT * 1.045];

const MAX_SPEND = FORECAST_RANGE[1] * 1.12;

export function ForecastDiagram() {
  const [mounted, setMounted] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 150);
    return () => clearTimeout(t);
  }, []);

  const padX = 56;
  const padY = 40;
  const width = 900;
  const height = 320;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;

  const xForDay = (d: number) => padX + (d / (DAYS - 1)) * plotW;
  const yForSpend = (s: number) => padY + plotH - (s / MAX_SPEND) * plotH;

  const actualPath = ACTUAL.map((v, i) => `${i === 0 ? "M" : "L"} ${xForDay(i)} ${yForSpend(v)}`).join(" ");
  const projectedPath = PROJECTED.map((v, i) => `${i === 0 ? "M" : "L"} ${xForDay(TODAY + i)} ${yForSpend(v)}`).join(" ");

  const areaActual = `
    M ${xForDay(0)} ${yForSpend(0)}
    ${ACTUAL.map((v, i) => `L ${xForDay(i)} ${yForSpend(v)}`).join(" ")}
    L ${xForDay(TODAY - 1)} ${yForSpend(0)}
    Z
  `;

  const rangeTop = yForSpend(FORECAST_RANGE[1]);
  const rangeBottom = yForSpend(FORECAST_RANGE[0]);
  const rangeCenter = yForSpend(FORECAST_POINT);

  return (
    <div className="mx-auto max-w-5xl">
      <Reveal>
        <div className="text-center">
          <p className="num text-[11px] font-medium uppercase tracking-[0.18em] text-primary">
            How the forecast is built
          </p>
          <h3 className="mt-3 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">
            Known spend. Projected days. Honest range.
          </h3>
        </div>
      </Reveal>

      <Reveal delay={120} className="mt-12">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-background/50">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${width} ${height}`}
            className="w-full select-none"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              <linearGradient id="knownGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.35" />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.05" />
              </linearGradient>
              <linearGradient id="projectedGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--primary-glow)" stopOpacity="0.45" />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.15" />
              </linearGradient>
              <pattern id="projectedHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="8" stroke="var(--primary)" strokeOpacity="0.12" strokeWidth="1" />
              </pattern>
              <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="var(--muted-foreground)" />
              </marker>
            </defs>

            {/* X-axis hairline */}
            <line x1={padX} y1={padY + plotH} x2={padX + plotW} y2={padY + plotH} stroke="var(--border)" strokeWidth="1" />

            {/* Day ticks */}
            {[0, 7, 14, 21, 29].map((d) => (
              <g key={d}>
                <line x1={xForDay(d)} y1={padY + plotH} x2={xForDay(d)} y2={padY + plotH + 5} stroke="var(--border)" />
                <text x={xForDay(d)} y={padY + plotH + 22} textAnchor="middle" className="fill-muted-foreground text-[11px] font-medium uppercase tracking-[0.1em]">
                  Day {d + 1}
                </text>
              </g>
            ))}

            {/* Known area */}
            <path d={areaActual} fill="url(#knownGradient)" className="transition-all duration-1000" style={{ opacity: mounted ? 1 : 0 }} />

            {/* Known spend line */}
            <path
              d={actualPath}
              fill="none"
              stroke="var(--primary)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                strokeDasharray: mounted ? "none" : "1200",
                strokeDashoffset: mounted ? 0 : 1200,
                transition: "stroke-dashoffset 1.4s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.8s",
              }}
            />

            {/* Projected area band */}
            <rect
              x={xForDay(TODAY - 1)}
              y={padY}
              width={xForDay(DAYS - 1) - xForDay(TODAY - 1)}
              height={plotH}
              fill="url(#projectedHatch)"
              className="transition-opacity duration-1000"
              style={{ opacity: mounted ? 1 : 0 }}
            />

            {/* Projected spend line (dashed) */}
            <path
              d={projectedPath}
              fill="none"
              stroke="var(--primary-glow)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="6 5"
              style={{
                opacity: mounted ? 1 : 0,
                transition: "opacity 1s cubic-bezier(0.22, 1, 0.36, 1) 0.3s",
              }}
            />

            {/* Today marker */}
            <line
              x1={xForDay(TODAY - 1)}
              y1={padY}
              x2={xForDay(TODAY - 1)}
              y2={padY + plotH}
              stroke="var(--foreground)"
              strokeWidth="1"
              strokeDasharray="4 4"
              style={{ opacity: mounted ? 0.6 : 0, transition: "opacity 1s" }}
            />

            {/* Forecast range band at month-end */}
            <rect
              x={xForDay(DAYS - 1) - 38}
              y={rangeTop}
              width="76"
              height={rangeBottom - rangeTop}
              rx="6"
              fill="var(--saving-soft)"
              stroke="var(--saving)"
              strokeWidth="1"
              style={{
                opacity: mounted ? 1 : 0,
                transform: `scaleY(${mounted ? 1 : 0})`,
                transformOrigin: `${xForDay(DAYS - 1)}px ${rangeCenter}px`,
                transition: "opacity 0.8s 0.6s, transform 0.9s cubic-bezier(0.22, 1, 0.36, 1) 0.5s",
              }}
            />

            {/* Forecast point */}
            <circle
              cx={xForDay(DAYS - 1)}
              cy={rangeCenter}
              r="5"
              fill="var(--saving)"
              stroke="var(--background)"
              strokeWidth="2"
              style={{
                opacity: mounted ? 1 : 0,
                transform: `scale(${mounted ? 1 : 0})`,
                transformOrigin: `${xForDay(DAYS - 1)}px ${rangeCenter}px`,
                transition: "opacity 0.5s 0.8s, transform 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.7s",
              }}
            />

            {/* Labels */}
            <text
              x={xForDay(TODAY - 1) - 10}
              y={padY + 18}
              textAnchor="end"
              className="fill-foreground text-[12px] font-semibold"
              style={{ opacity: mounted ? 1 : 0, transition: "opacity 0.8s 0.2s" }}
            >
              Today
            </text>

            <text
              x={xForDay(DAYS - 1) + 14}
              y={rangeCenter - 14}
              textAnchor="start"
              className="fill-saving text-[12px] font-semibold"
              style={{ opacity: mounted ? 1 : 0, transition: "opacity 0.8s 0.9s" }}
            >
              Forecast
            </text>
            <text
              x={xForDay(DAYS - 1) + 14}
              y={rangeCenter + 6}
              textAnchor="start"
              className="fill-muted-foreground text-[11px]"
              style={{ opacity: mounted ? 1 : 0, transition: "opacity 0.8s 1s" }}
            >
              point or range
            </text>
          </svg>
        </div>
      </Reveal>

      <Reveal delay={220} className="mx-auto mt-10 max-w-3xl">
        <div className="grid gap-6 border-t border-border pt-8 sm:grid-cols-3">
          {[
            {
              label: "Known",
              value: "Month-to-date",
              body: "Every day already billed is a fixed measurement. It never moves.",
              marker: "solid",
            },
            {
              label: "Projected",
              value: "Remaining days",
              body: "Trailing usage shape is carried forward, damped so one spike cannot run away.",
              marker: "dashed",
            },
            {
              label: "Forecast",
              value: "Month-end",
              body: "A single number when the data supports it; a range when that would be dishonest.",
              marker: "range",
            },
          ].map((item) => (
            <div key={item.label} className="text-center sm:text-left">
              <div className="flex items-center justify-center gap-2 sm:justify-start">
                {item.marker === "solid" && <span className="h-2 w-8 rounded-full bg-primary" />}
                {item.marker === "dashed" && (
                  <span className="h-0.5 w-8 border-t-2 border-dashed border-primary-glow" />
                )}
                {item.marker === "range" && (
                  <span className="h-3 w-5 rounded-sm bg-saving/30 ring-1 ring-saving" />
                )}
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {item.label}
                </span>
              </div>
              <p className="mt-3 text-lg font-semibold tracking-[-0.02em]">{item.value}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>
      </Reveal>
    </div>
  );
}
