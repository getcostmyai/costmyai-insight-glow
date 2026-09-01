/**
 * The newsletter's three chart drawings.
 *
 * Email clients do not run scripts and mangle inline SVG, so a chart in an
 * issue is a real PNG at a fixed URL. This module builds the SVG; the shared
 * renderer (src/lib/brand/render.server.ts) turns it into pixels, exactly as it
 * does for the Intelligence share images.
 *
 * Two rules shape every drawing here:
 *
 * 1. Everything sits on an opaque deep-ink panel with light type. A newsletter
 *    is read in both light and dark inboxes, and a chart drawn on transparency
 *    or on white disappears in one of them. Opaque ink reads the same in both,
 *    and clients that force-invert cannot invert the inside of a PNG.
 * 2. The numbers arrive in the directive, not from a query. An issue sent in
 *    September must still render the September chart in a year's time.
 */

import { esc } from "@/lib/brand/render.server";
import {
  CHART_KINDS,
  CHART_WIDTH,
  chartPixelHeight,
  parseChartRows,
  type ChartKind,
  type ChartSpec,
} from "./markdown";

export { CHART_WIDTH };
export type { ChartKind, ChartSpec };

/** Inter with a real fallback chain: the renderer has no Inter face installed. */
const FONT = "Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif";

/** Deep ink, so the panel reads identically on a white or a black surface. */
const INK = "#141024";
const INK_SOFT = "#1d1733";
const HAIRLINE = "#3a3357";
const TEXT = "#f4f2fa";
const MUTED = "#a79fc4";
const PURPLE = "#8B5CF6";
const CORAL = "#FF6B5A";

export function isChartKind(value: string): value is ChartKind {
  return (CHART_KINDS as string[]).includes(value);
}

const rows = parseChartRows;

const num = (value: string | undefined): number => {
  const parsed = Number.parseFloat(String(value ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const money = (value: number): string =>
  value >= 1 ? `$${value.toFixed(2)}` : `$${value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}`;

function frame(height: number, title: string, note: string | undefined, body: string): string {
  const footer = note
    ? `<text x="40" y="${height - 26}" fill="${MUTED}" font-size="19" font-family="${FONT}">${esc(note)}</text>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CHART_WIDTH}" height="${height}" viewBox="0 0 ${CHART_WIDTH} ${height}" role="img">
  <defs>
    <linearGradient id="brand" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${PURPLE}"/>
      <stop offset="100%" stop-color="${CORAL}"/>
    </linearGradient>
    <linearGradient id="wash" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${INK_SOFT}"/>
      <stop offset="100%" stop-color="${INK}"/>
    </linearGradient>
  </defs>
  <rect width="${CHART_WIDTH}" height="${height}" rx="24" fill="url(#wash)"/>
  <rect x="0" y="0" width="${CHART_WIDTH}" height="4" rx="2" fill="url(#brand)"/>
  <text x="40" y="62" fill="${TEXT}" font-size="30" font-weight="600" font-family="${FONT}">${esc(title)}</text>
  <text x="${CHART_WIDTH - 40}" y="62" fill="${MUTED}" font-size="17" font-weight="500" font-family="${FONT}" text-anchor="end" letter-spacing="1.6">COSTMYAI</text>
  ${body}
  ${footer}
</svg>`;
}

/** Horizontal bars. `Label:-40|Label:-12`, values in percent. */
function barsSvg(spec: ChartSpec): string {
  const items = rows(spec.data)
    .slice(0, 6)
    .map((parts) => ({ label: parts[0]!, value: num(parts[1]) }));
  const rowH = 62;
  const top = 108;
  const height = chartPixelHeight(spec);
  const labelW = 330;
  const trackX = 40 + labelW;
  const trackW = CHART_WIDTH - trackX - 150;
  const max = Math.max(1, ...items.map((i) => Math.abs(i.value)));

  const body = items
    .map((item, i) => {
      const y = top + i * rowH;
      const w = Math.max(6, (Math.abs(item.value) / max) * trackW);
      const sign = item.value > 0 ? "+" : item.value < 0 ? "-" : "";
      return `<g>
    <text x="40" y="${y + 26}" fill="${TEXT}" font-size="22" font-family="${FONT}">${esc(item.label)}</text>
    <rect x="${trackX}" y="${y + 8}" width="${trackW}" height="24" rx="12" fill="${HAIRLINE}" opacity="0.45"/>
    <rect x="${trackX}" y="${y + 8}" width="${w}" height="24" rx="12" fill="url(#brand)"/>
    <text x="${trackX + trackW + 20}" y="${y + 27}" fill="${TEXT}" font-size="23" font-weight="600" font-family="${FONT}">${sign}${Math.abs(item.value)}%</text>
  </g>`;
    })
    .join("\n");

  return frame(height, spec.title, spec.note, body);
}

/** Cheapest-to-dearest rails. `Model:0.234:3.375` per row. */
function spreadSvg(spec: ChartSpec): string {
  const items = rows(spec.data)
    .slice(0, 5)
    .map((parts) => ({ label: parts[0]!, low: num(parts[1]), high: num(parts[2]) }));
  const rowH = 92;
  const top = 110;
  const height = chartPixelHeight(spec);
  const railX = 300;
  const railW = CHART_WIDTH - railX - 190;
  const maxHigh = Math.max(1, ...items.map((i) => i.high));

  const body = items
    .map((item, i) => {
      const y = top + i * rowH;
      const lowX = railX + (item.low / maxHigh) * railW;
      const highX = railX + (item.high / maxHigh) * railW;
      const factor = item.low > 0 ? item.high / item.low : 0;
      // Two dots close together would otherwise print their prices on top of each other.
      const tight = highX - lowX < 110;
      return `<g>
    <text x="40" y="${y + 26}" fill="${TEXT}" font-size="22" font-family="${FONT}">${esc(item.label)}</text>
    <line x1="${railX}" y1="${y + 20}" x2="${railX + railW}" y2="${y + 20}" stroke="${HAIRLINE}" stroke-width="2"/>
    <line x1="${lowX}" y1="${y + 20}" x2="${highX}" y2="${y + 20}" stroke="url(#brand)" stroke-width="8" stroke-linecap="round"/>
    <circle cx="${lowX}" cy="${y + 20}" r="10" fill="${PURPLE}"/>
    <circle cx="${highX}" cy="${y + 20}" r="10" fill="${CORAL}"/>
    <text x="${tight ? lowX - 12 : lowX}" y="${y + 50}" fill="${MUTED}" font-size="18" font-family="${FONT}" text-anchor="${tight ? "end" : "middle"}">${money(item.low)}</text>
    <text x="${tight ? highX + 12 : highX}" y="${y + 50}" fill="${MUTED}" font-size="18" font-family="${FONT}" text-anchor="${tight ? "start" : "middle"}">${money(item.high)}</text>
    <text x="${CHART_WIDTH - 40}" y="${y + 28}" fill="${TEXT}" font-size="26" font-weight="700" font-family="${FONT}" text-anchor="end">${factor.toFixed(1)}x</text>
  </g>`;
    })
    .join("\n");

  return frame(height, spec.title, spec.note, body);
}

/** Quality against price. `Model:89.1:10.00` — score, then blended price. */
function scatterSvg(spec: ChartSpec): string {
  const items = rows(spec.data)
    .slice(0, 8)
    .map((parts) => ({ label: parts[0]!, score: num(parts[1]), price: Math.max(num(parts[2]), 0.0001) }));
  const height = chartPixelHeight(spec);
  const plot = { x: 110, y: 110, w: CHART_WIDTH - 190, h: 380 };

  const scores = items.map((i) => i.score);
  const minScore = Math.min(...scores, 0) === 0 ? 0 : Math.min(...scores);
  const loScore = Math.max(0, Math.floor((minScore - 4) / 5) * 5);
  const hiScore = Math.ceil((Math.max(...scores, 1) + 2) / 5) * 5;
  const logs = items.map((i) => Math.log10(i.price));
  const loLog = Math.min(...logs) - 0.25;
  const hiLog = Math.max(...logs) + 0.25;

  const px = (price: number) =>
    plot.x + ((Math.log10(price) - loLog) / Math.max(hiLog - loLog, 0.001)) * plot.w;
  const py = (score: number) =>
    plot.y + plot.h - ((score - loScore) / Math.max(hiScore - loScore, 0.001)) * plot.h;

  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map((t) => {
      const y = plot.y + plot.h * t;
      return `<line x1="${plot.x}" y1="${y}" x2="${plot.x + plot.w}" y2="${y}" stroke="${HAIRLINE}" stroke-width="1" opacity="0.55"/>`;
    })
    .join("\n");

  const dots = items
    .map((item, i) => {
      const x = px(item.price);
      const y = py(item.score);
      const flip = x > plot.x + plot.w * 0.72;
      return `<g>
    <circle cx="${x}" cy="${y}" r="13" fill="${i === 0 ? CORAL : PURPLE}"/>
    <text x="${flip ? x - 22 : x + 22}" y="${y + 7}" fill="${TEXT}" font-size="21" font-family="${FONT}" text-anchor="${flip ? "end" : "start"}">${esc(item.label)}</text>
  </g>`;
    })
    .join("\n");

  const body = `${grid}
  <text x="40" y="${plot.y + 10}" fill="${MUTED}" font-size="17" font-family="${FONT}">${hiScore}</text>
  <text x="40" y="${plot.y + plot.h}" fill="${MUTED}" font-size="17" font-family="${FONT}">${loScore}</text>
  <text x="40" y="${plot.y + plot.h / 2}" fill="${MUTED}" font-size="17" font-family="${FONT}">score</text>
  <line x1="${plot.x}" y1="${plot.y + plot.h}" x2="${plot.x + plot.w}" y2="${plot.y + plot.h}" stroke="${HAIRLINE}" stroke-width="2"/>
  <text x="${plot.x}" y="${plot.y + plot.h + 40}" fill="${MUTED}" font-size="18" font-family="${FONT}">cheaper</text>
  <text x="${plot.x + plot.w}" y="${plot.y + plot.h + 40}" fill="${MUTED}" font-size="18" font-family="${FONT}" text-anchor="end">dearer, blended per Mtok, log scale</text>
  ${dots}`;

  return frame(height, spec.title, spec.note, body);
}

export function chartSvg(spec: ChartSpec): string {
  if (spec.kind === "spread") return spreadSvg(spec);
  if (spec.kind === "scatter") return scatterSvg(spec);
  return barsSvg(spec);
}

