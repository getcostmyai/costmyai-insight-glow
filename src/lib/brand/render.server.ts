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

  const endpoint = `${base.replace(/\/$/, "")}/render`;
  const body = JSON.stringify({ svg, width });

  /*
   * Two attempts, not one: a rolling deploy can leave a stale instance behind
   * the same hostname for a while, and one bad hit should not cost the caller
   * its PNG. Anything still failing after the retry throws, and the route falls
   * back to a static poster.
   *
   * Each attempt is capped at 4s. A cold renderer instance fetches its fonts
   * before it can rasterise anything, and an unbounded wait there is what turns
   * a slow start into a crawler seeing no image at all: LinkedIn gives up around
   * five seconds. Failing fast inside that budget lets the fallback win the race.
   */
  let last = "";
  for (let attempt = 0; attempt < 2; attempt++) {
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
      last = `renderer service returned ${res.status}`;
    } catch (err) {
      // An abort arrives here like any other fetch failure, so a timeout simply
      // rolls on to the next attempt.
      last = err instanceof Error ? err.message : String(err);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(last);
}


