import { useState } from "react";
import { spendSeries } from "@/lib/dashboard-data";

/** Gradient bar chart with a soft trend area behind it. Pure SVG, no serif numerals. */
export function SpendChart() {
  const [hover, setHover] = useState<number | null>(null);
  const w = 900;
  const h = 220;
  const pad = { t: 16, b: 26 };
  const max = Math.max(...spendSeries.map((d) => d.spend)) * 1.12;
  const n = spendSeries.length;
  const slot = w / n;
  const barW = slot * 0.5;
  const y = (v: number) => pad.t + (1 - v / max) * (h - pad.t - pad.b);

  const areaPoints = spendSeries
    .map((d, i) => `${i * slot + slot / 2},${y(d.spend)}`)
    .join(" ");

  const active = hover === null ? null : spendSeries[hover];

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full"
        preserveAspectRatio="none"
        style={{ height: 220 }}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.7 0.19 300)" />
            <stop offset="100%" stopColor="oklch(0.55 0.235 291)" />
          </linearGradient>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.55 0.235 291)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="oklch(0.55 0.235 291)" stopOpacity="0" />
          </linearGradient>
        </defs>

        <polygon
          points={`0,${h - pad.b} ${areaPoints} ${w},${h - pad.b}`}
          fill="url(#areaGrad)"
        />

        {spendSeries.map((d, i) => {
          const top = y(d.spend);
          const isOn = hover === null || hover === i;
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)}>
              <rect
                x={i * slot}
                y={0}
                width={slot}
                height={h}
                fill="transparent"
              />
              <rect
                x={i * slot + (slot - barW) / 2}
                y={top}
                width={barW}
                height={h - pad.b - top}
                rx={barW / 2.4}
                fill="url(#barGrad)"
                opacity={isOn ? 1 : 0.32}
                style={{ transition: "opacity 0.2s" }}
              />
            </g>
          );
        })}

        {[0, 6, 12, 18, 24, 29].map((i) => (
          <text
            key={i}
            x={i * slot + slot / 2}
            y={h - 6}
            textAnchor="middle"
            fontSize="11"
            fill="currentColor"
            className="text-muted-foreground"
            style={{ fontFamily: "var(--font-sans)" }}
          >
            {spendSeries[i].date}
          </text>
        ))}
      </svg>

      <div className="mt-2 h-5 text-xs text-muted-foreground">
        {active ? (
          <span>
            <span className="num text-foreground">${active.spend}</span> spend on {active.date}
          </span>
        ) : (
          <span>Hover a day to inspect gateway spend</span>
        )}
      </div>
    </div>
  );
}
