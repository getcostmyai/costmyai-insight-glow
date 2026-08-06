import { esc, renderSvgToPng } from "@/lib/brand/render.server";

import type { ShareCard } from "./share-cards";
import { monthLabelOf } from "./snapshot.server";

/**
 * Per-card social preview image.
 *
 * The frozen month is rendered *into* the pixels, not just into the page copy
 * around them: a screenshot of this image reposted with no link still says
 * which month the number belongs to. Everything drawn here comes from the same
 * frozen payload the permanent month page renders, via `shareCards()` — there
 * is no second formatter that could drift from the page.
 *
 * We compose the SVG by hand rather than through a JSX/flexbox layout engine:
 * the layout is a fixed six-element poster, and hand-composing keeps the whole
 * pipeline to one wasm module (the rasteriser) instead of two.
 */

/**
 * Brand identity, taken straight from the dashboard palette (src/styles.css):
 * spend purple as the accent on the dashboard background, saving green for a
 * cut and destructive red for a rise — the same tones the app uses in-product,
 * so a shared poster reads as the same product as the dashboard.
 */
const PALETTE = {
  bg: "#FAFAFC",
  ink: "#11131D",
  body: "#4B4C57",
  muted: "#70717A",
  hairline: "#E6E6EA",
  primary: "#7945EC",
} as const;

const TONE: Record<ShareCard["tone"], string> = {
  brand: PALETTE.primary,
  up: "#E23439",
  down: "#008C53",
  neutral: PALETTE.ink,
};




/** Greedy wrap by estimated advance width — good enough for a two-line caption. */
function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if (line && (line + " " + w).length > maxChars) {
      lines.push(line);
      line = w;
      if (lines.length === maxLines) break;
    } else {
      line = line ? `${line} ${w}` : w;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[.,;:]$/, "")}…`;
  }
  return lines;
}

export function buildShareSvg(card: ShareCard, monthKey: string): string {
  const monthLabel = monthLabelOf(monthKey);
  const accent = TONE[card.tone];
  const len = card.value.length;
  const valueSize = len > 8 ? 132 : len > 5 ? 168 : 208;
  const detail = wrap(card.detail, 62, 2);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="glow" cx="0.1" cy="0.08" r="0.8">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.13"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="${PALETTE.bg}"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <rect x="0" y="0" width="1200" height="6" fill="${PALETTE.primary}"/>

  <text x="72" y="104" font-family="Inter" font-size="26" font-weight="600" fill="${PALETTE.ink}">Cost<tspan fill="${PALETTE.primary}">My</tspan>AI</text>
  <text x="215" y="104" font-family="Inter" font-size="26" font-weight="400" fill="${PALETTE.muted}">Intelligence</text>

  <text x="72" y="${330 - (valueSize - 208) / 2}" font-family="Inter" font-size="${valueSize}" font-weight="600" fill="${accent}" letter-spacing="-6">${esc(card.value)}</text>

  <text x="72" y="404" font-family="Inter" font-size="36" font-weight="600" fill="${PALETTE.ink}">${esc(card.label)}</text>
  ${detail
    .map(
      (l, i) =>
        `<text x="72" y="${454 + i * 36}" font-family="Inter" font-size="25" font-weight="400" fill="${PALETTE.body}">${esc(l)}</text>`,
    )
    .join("\n  ")}

  <rect x="72" y="536" width="1056" height="1" fill="${PALETTE.hairline}"/>
  <text x="72" y="580" font-family="Inter" font-size="24" font-weight="600" fill="${PALETTE.ink}">${esc(monthLabel)}</text>
  <text x="72" y="580" dx="${monthLabel.length * 13 + 14}" font-family="Inter" font-size="24" font-weight="400" fill="${PALETTE.muted}">· final, frozen figures</text>
  <text x="1128" y="580" text-anchor="end" font-family="Inter" font-size="22" font-weight="400" fill="${PALETTE.muted}">costmyai.com/intelligence/${esc(monthKey)}</text>
</svg>`;
}

export async function renderShareImage(
  card: ShareCard,
  monthKey: string,
  origin: string,
): Promise<Response> {
  const png = await renderSvgToPng(buildShareSvg(card, monthKey), 1200, origin);

  return new Response(png as unknown as BodyInit, {
    headers: {
      "content-type": "image/png",
      // A frozen figure never changes, so this is safe to cache hard.
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
