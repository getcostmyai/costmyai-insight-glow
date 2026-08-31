/**
 * One SVG-to-PNG pipeline for the whole product.
 *
 * Cloudflare Workers cannot construct a WebAssembly module from bytes at
 * request time, so rasterisation happens off-worker: this module builds nothing
 * but the HTTP call to the renderer service (packages/renderer-service), which
 * runs the native resvg binding with the same fit-to-width / Inter settings.
 *
 * Callers are expected to catch a throw here and fall back to serving the SVG
 * itself — a renderer outage must never turn into a 500.
 */

/** Total budget for the renderer call — one attempt, no retry. See below. */
export const RENDER_TIMEOUT_MS = 3000;

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Rasterise an SVG document at an exact pixel width, off-worker. */
export async function renderSvgToPng(
  svg: string,
  width: number,
  _origin?: string,
): Promise<Uint8Array> {
  const base = process.env["RENDERER_SERVICE_URL"];
  const secret = process.env["RENDER_SHARED_SECRET"];
  if (!base || !secret) throw new Error("renderer service is not configured");

  const endpoint = `${base.replace(/\/$/, "")}/render`;
  const body = JSON.stringify({ svg, width });

  /*
   * Single attempt, not two: two 4s attempts could take up to 8s worst-case
   * before falling back, past LinkedIn's ~5s crawler patience — a confirmed
   * cause of "no image" on native Share to Feed (2026-08-31 diagnosis). A cold
   * renderer instance fetches its fonts before it can rasterise anything, and
   * an unbounded wait there is what turns a slow start into a crawler seeing
   * no image at all. One 3s shot, then straight to the static-poster fallback,
   * keeps the worst case safely under that ceiling.
   */
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RENDER_TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "x-render-secret": secret },
      body,
      signal: controller.signal,
    });
    if (res.ok) return new Uint8Array(await res.arrayBuffer());
    throw new Error(`renderer service returned ${res.status}`);
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err));
  } finally {
    clearTimeout(timer);
  }
}


