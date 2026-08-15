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

  const res = await fetch(`${base.replace(/\/$/, "")}/render`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-render-secret": secret,
    },
    body: JSON.stringify({ svg, width }),
  });

  if (!res.ok) {
    throw new Error(`renderer service returned ${res.status} for ${new URL(res.url || base).host}`);
  }

  return new Uint8Array(await res.arrayBuffer());
}
