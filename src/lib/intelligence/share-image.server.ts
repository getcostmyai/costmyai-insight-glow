// Vite asset import: resolves to the served URL of the wasm binary.
import resvgWasmUrl from "@resvg/resvg-wasm/index_bg.wasm?url";
import { initWasm, Resvg } from "@resvg/resvg-wasm";

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

const TONE: Record<ShareCard["tone"], string> = {
  brand: "#A78BFA",
  up: "#FB7185",
  down: "#34D399",
  neutral: "#E5E7EB",
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

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
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0B0A12"/>
      <stop offset="60%" stop-color="#100D1E"/>
      <stop offset="100%" stop-color="#1A1030"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.12" cy="0.1" r="0.75">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <rect x="0" y="0" width="1200" height="6" fill="${accent}"/>

  <text x="72" y="104" font-family="Inter" font-size="26" font-weight="600" fill="#FFFFFF">CostMyAI</text>
  <text x="215" y="104" font-family="Inter" font-size="26" font-weight="400" fill="#8B8B9E">Intelligence</text>

  <text x="72" y="${330 - (valueSize - 208) / 2}" font-family="Inter" font-size="${valueSize}" font-weight="600" fill="${accent}" letter-spacing="-6">${esc(card.value)}</text>

  <text x="72" y="404" font-family="Inter" font-size="36" font-weight="600" fill="#FFFFFF">${esc(card.label)}</text>
  ${detail
    .map(
      (l, i) =>
        `<text x="72" y="${454 + i * 36}" font-family="Inter" font-size="25" font-weight="400" fill="#9C9CB0">${esc(l)}</text>`,
    )
    .join("\n  ")}

  <rect x="72" y="536" width="1056" height="1" fill="#2A2740"/>
  <text x="72" y="580" font-family="Inter" font-size="24" font-weight="600" fill="#FFFFFF">${esc(monthLabel)}</text>
  <text x="72" y="580" dx="${monthLabel.length * 13 + 14}" font-family="Inter" font-size="24" font-weight="400" fill="#8B8B9E">· final, frozen figures</text>
  <text x="1128" y="580" text-anchor="end" font-family="Inter" font-size="22" font-weight="400" fill="#8B8B9E">costmyai.com/intelligence/${esc(monthKey)}</text>
</svg>`;
}

let wasmReady: Promise<void> | null = null;
function ensureWasm(origin: string) {
  if (!wasmReady) {
    wasmReady = initWasm(fetch(new URL(resvgWasmUrl as string, origin))).catch((err) => {
      wasmReady = null;
      throw err;
    });
  }
  return wasmReady;
}

let fontCache: Uint8Array[] | null = null;

/**
 * Inter, as real font bytes. The Google CSS endpoint returns TTF URLs when the
 * request carries no modern browser UA — resvg cannot read woff2, so we rely on
 * that deliberately rather than shipping a font file in the repo.
 */
async function loadFonts(): Promise<Uint8Array[]> {
  if (fontCache) return fontCache;
  const css = await fetch("https://fonts.googleapis.com/css2?family=Inter:wght@400;600").then((r) =>
    r.text(),
  );
  const urls = [...css.matchAll(/url\((https:\/\/[^)]+\.ttf)\)/g)].map((m) => m[1]).slice(0, 2);
  if (urls.length === 0) throw new Error("no TTF face returned for Inter");
  const buffers = await Promise.all(
    urls.map(async (u) => {
      const buf = (await (await fetch(u)).arrayBuffer()) as ArrayBuffer;
      return new Uint8Array(buf);
    }),
  );
  fontCache = buffers;
  return buffers;
}

export async function renderShareImage(
  card: ShareCard,
  monthKey: string,
  origin: string,
): Promise<Response> {
  await ensureWasm(origin);
  const fontBuffers = await loadFonts();

  const resvg = new Resvg(buildShareSvg(card, monthKey), {
    fitTo: { mode: "width", value: 1200 },
    font: { fontBuffers, defaultFontFamily: "Inter", loadSystemFonts: false },
  });
  const png = resvg.render().asPng();

  return new Response(png as unknown as BodyInit, {
    headers: {
      "content-type": "image/png",
      // A frozen figure never changes, so this is safe to cache hard.
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
