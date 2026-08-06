import { initWasm, Resvg } from "@resvg/resvg-wasm";

// Served as a static asset from `public/wasm/`, fetched by URL at render time.
// Importing the binary from source would bundle it and break the deploy.
const RESVG_WASM_PATH = "/wasm/resvg.wasm";

/**
 * One SVG-to-PNG pipeline for the whole product.
 *
 * Both the Intelligence share posters and the partner badge/banners rasterise
 * the same way, with the same font bytes and the same wasm module. Keeping one
 * copy means a font or rasteriser change can never make two brand surfaces
 * disagree.
 */

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The wasm module can only be initialised once per isolate, and the promise has
 * to outlive this module: a hot reload, or a second copy of the module in a
 * different bundle chunk, would otherwise call `initWasm` again and the second
 * caller would get "Already initialized" instead of an image. Parking the
 * promise on `globalThis` makes the guard isolate-wide, and treating an
 * already-initialised rasteriser as success covers the case where something
 * else initialised it first.
 */
const WASM_KEY = "__costmyai_resvg_wasm__";

export function ensureWasm(origin: string): Promise<void> {
  const g = globalThis as Record<string, unknown>;
  let ready = g[WASM_KEY] as Promise<void> | undefined;
  if (!ready) {
    ready = initWasm(fetch(new URL(RESVG_WASM_PATH, origin)))
      .then(() => undefined)
      .catch((err: unknown) => {
        if (err instanceof Error && /already initialized/i.test(err.message)) return;
        delete g[WASM_KEY];
        throw err;
      });
    g[WASM_KEY] = ready;
  }
  return ready;
}

let fontCache: Uint8Array[] | null = null;

/**
 * Inter, as real font bytes. The Google CSS endpoint returns TTF URLs when the
 * request carries no modern browser UA — resvg cannot read woff2, so we rely on
 * that deliberately rather than shipping a font file in the repo.
 */
export async function loadInterFonts(): Promise<Uint8Array[]> {
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

/** Rasterise an SVG document at an exact pixel width. */
export async function renderSvgToPng(
  svg: string,
  width: number,
  origin: string,
): Promise<Uint8Array> {
  await ensureWasm(origin);
  const fontBuffers = await loadInterFonts();
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    font: { fontBuffers, defaultFontFamily: "Inter", loadSystemFonts: false },
  });
  return resvg.render().asPng();
}
