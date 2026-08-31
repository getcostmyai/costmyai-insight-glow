import { esc, renderSvgToPng } from "@/lib/brand/render.server";

import { asOfLabel, type ShareCard } from "./share-cards";
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

/**
 * What the poster footer states. A frozen month is a permanent citation; the
 * live month is honestly stamped with the moment it was computed.
 */
export type ShareImageCitation =
  | { kind: "frozen"; monthKey: string }
  | { kind: "live"; monthLabel: string; generatedAt: string };

export function buildShareSvg(card: ShareCard, citation: ShareImageCitation): string {
  const monthLabel =
    citation.kind === "frozen" ? monthLabelOf(citation.monthKey) : citation.monthLabel;
  const footerNote =
    citation.kind === "frozen"
      ? "· final, frozen figures"
      : `· live, still moving · as of ${asOfLabel(citation.generatedAt)}`;
  // The frozen note is short enough to sit at footer size; the live stamp
  // carries a timestamp and would otherwise run into "Powered by CostMyAI".
  const noteSize = citation.kind === "frozen" ? 24 : 19;
  const permalink =
    citation.kind === "frozen"
      ? `costmyai.com/intelligence/${citation.monthKey}`
      : "costmyai.com/intelligence";
  const accent = TONE[card.tone];
  const len = card.value.length;
  const valueSize = len > 8 ? 132 : len > 5 ? 168 : 208;
  const detail = wrap(card.detail, 62, 2);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <!-- Matches the gradient-brand-wide token in src/styles.css, so the poster wordmark
         is the same gradient as the on-site <Wordmark /> component. -->
    <linearGradient id="wordmarkGradient" x1="0%" y1="20%" x2="100%" y2="80%">
      <stop offset="0%" stop-color="#6366F1"/>
      <stop offset="34%" stop-color="#7C3AED"/>
      <stop offset="62%" stop-color="#C03CC8"/>
      <stop offset="88%" stop-color="#FB715C"/>
      <stop offset="100%" stop-color="#FBB059"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.1" cy="0.08" r="0.8">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.13"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    <!-- Brand-family wash: indigo → violet → magenta, each barely there. The
         card content still reads as the subject; this only tints the field. -->
    <radialGradient id="brandGlowA" cx="0.08" cy="0.05" r="0.75">
      <stop offset="0%" stop-color="#6366F1" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="#6366F1" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="brandGlowB" cx="0.62" cy="0.02" r="0.62">
      <stop offset="0%" stop-color="#7C3AED" stop-opacity="0.07"/>
      <stop offset="100%" stop-color="#7C3AED" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="brandGlowC" cx="1" cy="0.9" r="0.7">
      <stop offset="0%" stop-color="#C03CC8" stop-opacity="0.07"/>
      <stop offset="100%" stop-color="#C03CC8" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="${PALETTE.bg}"/>
  <rect width="1200" height="630" fill="url(#brandGlowA)"/>
  <rect width="1200" height="630" fill="url(#brandGlowB)"/>
  <rect width="1200" height="630" fill="url(#brandGlowC)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <rect x="0" y="0" width="1200" height="6" fill="${PALETTE.primary}"/>

  <text x="72" y="104" font-family="Inter" font-size="26" font-weight="600" fill="${PALETTE.ink}">Cost<tspan fill="url(#wordmarkGradient)">My</tspan>AI</text>
  <text x="215" y="104" font-family="Inter" font-size="26" font-weight="400" fill="${PALETTE.muted}">Intelligence</text>

  <text x="72" y="${330 - (valueSize - 208) / 2}" font-family="Inter" font-size="${valueSize}" font-weight="600" fill="${accent}" letter-spacing="-6">${esc(card.value)}</text>

  <text x="72" y="404" font-family="Inter" font-size="36" font-weight="600" fill="${PALETTE.ink}">${esc(card.label)}</text>
  ${detail
    .map(
      (l, i) =>
        `<text x="72" y="${454 + i * 36}" font-family="Inter" font-size="25" font-weight="400" fill="${PALETTE.body}">${esc(l)}</text>`,
    )
    .join("\n  ")}

  <rect x="72" y="530" width="1056" height="1" fill="${PALETTE.hairline}"/>
  <text x="72" y="568" font-family="Inter" font-size="${noteSize}" font-weight="400" fill="${PALETTE.muted}"><tspan font-size="24" font-weight="600" fill="${PALETTE.ink}">${esc(monthLabel)}</tspan> ${esc(footerNote)}</text>
  <text x="72" y="600" font-family="Inter" font-size="20" font-weight="400" fill="${PALETTE.muted}">${esc(permalink)}</text>
  <text x="1128" y="600" text-anchor="end" font-family="Inter" font-size="22" font-weight="600" fill="${PALETTE.ink}">Powered by CostMyAI</text>

</svg>`;
}

export async function renderShareImage(
  card: ShareCard,
  citation: ShareImageCitation,
  origin: string,
): Promise<Response> {
  const png = await renderSvgToPng(buildShareSvg(card, citation), 1200, origin);

  return new Response(png as unknown as BodyInit, {
    headers: {
      "content-type": "image/png",
      // A frozen figure never changes, so it is safe to cache hard. A live one
      // moves, so it must not be cached like a permanent citation.
      "cache-control":
        citation.kind === "frozen" ? "public, max-age=31536000, immutable" : "public, max-age=120",
    },
  });
}
