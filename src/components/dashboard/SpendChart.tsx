import { useState } from "react";
import type { Point } from "@/lib/gateway-metrics";
import { compact } from "@/lib/gateway-metrics";

export type ChartMetric = "spend" | "requests" | "tokens";

interface Props {
  series: Point[];
  metric: ChartMetric;
}

const valueOf = (d: Point, m: ChartMetric) =>
  m === "spend" ? d.spend : m === "requests" ? d.requests : d.inputTokens + d.outputTokens;

const fmt = (v: number, m: ChartMetric) =>
  m === "spend" ? `$${v.toFixed(2)}` : m === "requests" ? compact(v) : `${compact(v)} tok`;

/** Gradient bar chart with a soft trend area behind it. Pure SVG, no serif numerals. */
export function SpendChart({ series, metric }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const w = 900;
  const h = 220;
  const pad = { t: 16, b: 26 };
  const max = Math.max(...series.map((d) => valueOf(d, metric))) * 1.12 || 1;
  const n = series.length;
  const slot = w / n;
  const barW = slot * 0.5;
  const y = (v: number) => pad.t + (1 - v / max) * (h - pad.t - pad.b);

  const areaPoints = series
    .map((d, i) => `${i * slot + slot / 2},${y(valueOf(d, metric))}`)
    .join(" ");

  const active = hover === null ? null : series[hover];
  const labelEvery = Math.max(1, Math.round(n / 6));

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

        <polygon points={`0,${h - pad.b} ${areaPoints} ${w},${h - pad.b}`} fill="url(#areaGrad)" />

        {series.map((d, i) => {
          const top = y(valueOf(d, metric));
          const isOn = hover === null || hover === i;
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)}>
              <rect x={i * slot} y={0} width={slot} height={h} fill="transparent" />
              <rect
                x={i * slot + (slot - barW) / 2}
                y={top}
                width={barW}
                height={h - pad.b - top}
                rx={barW / 2.4}
                fill="url(#barGrad)"
                opacity={isOn ? 1 : 0.32}
                style={{
                  transition:
                    "opacity 0.2s, y 0.4s cubic-bezier(0.22,1,0.36,1), height 0.4s cubic-bezier(0.22,1,0.36,1)",
                }}
              />
            </g>
          );
        })}

        {series.map((d, i) =>
          i % labelEvery === 0 || i === n - 1 ? (
            <text
              key={`l-${d.date}`}
              x={i * slot + slot / 2}
              y={h - 6}
              textAnchor="middle"
              fontSize="11"
              fill="currentColor"
              className="text-muted-foreground"
              style={{ fontFamily: "var(--font-sans)" }}
            >
              {d.date}
            </text>
          ) : null,
        )}
      </svg>

      <div className="mt-2 h-5 text-xs text-muted-foreground">
        {active ? (
          <span>
            <span className="num text-foreground">{fmt(valueOf(active, metric), metric)}</span> at{" "}
            {active.date}
          </span>
        ) : (
          <span>Hover a bucket to inspect gateway {metric}</span>
        )}
      </div>
    </div>
  );
}
