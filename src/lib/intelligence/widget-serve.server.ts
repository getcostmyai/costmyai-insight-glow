/**
 * Request handlers shared by the widget's routes.
 *
 * Two entry points serve the same document — the pretty `/embed/...` URL we
 * publish in the copy-paste snippet, and the `/api/public/embed/...` mirror that
 * is guaranteed to bypass site auth on every deployment. Both go through this
 * module so the cache, the limiter and the CSP can never diverge between them.
 */
import {
  callerKey,
  rateLimit,
  readWidgetPayload,
  WIDGET_RATE_LIMIT,
  WIDGET_RATE_WINDOW_MS,
  WIDGET_CACHE_TTL_MS,
} from "./widget.server";
import { renderWidgetDocument, widgetDocumentHeaders } from "./widget-html.server";

function limitHeaders(remaining: number) {
  return {
    "X-RateLimit-Limit": String(WIDGET_RATE_LIMIT),
    "X-RateLimit-Remaining": String(Math.max(0, remaining)),
    "X-RateLimit-Window": `${Math.floor(WIDGET_RATE_WINDOW_MS / 1000)}s`,
  };
}

function tooMany(retryAfterSec: number, contentType: string) {
  return new Response(
    contentType.startsWith("application/json")
      ? JSON.stringify({ error: "rate_limited", retryAfterSec })
      : "Rate limit exceeded",
    {
      status: 429,
      headers: {
        "Content-Type": contentType,
        "Retry-After": String(retryAfterSec),
        ...limitHeaders(0),
      },
    },
  );
}

const nonce = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

export async function serveWidgetDocument(request: Request): Promise<Response> {
  const verdict = rateLimit(`doc:${callerKey(request)}`);
  if (!verdict.ok) return tooMany(verdict.retryAfterSec, "text/plain; charset=utf-8");

  const url = new URL(request.url);
  const n = nonce();
  const payload = await readWidgetPayload();
  return new Response(renderWidgetDocument(payload, { origin: url.origin, nonce: n }), {
    status: 200,
    headers: { ...widgetDocumentHeaders(n), ...limitHeaders(verdict.remaining) },
  });
}

export async function serveWidgetData(request: Request): Promise<Response> {
  const verdict = rateLimit(`data:${callerKey(request)}`);
  if (!verdict.ok) return tooMany(verdict.retryAfterSec, "application/json");

  const payload = await readWidgetPayload();
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      // Public market figures only; readable from the widget document and from
      // anyone who wants to cite them.
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept",
      "Cache-Control": `public, max-age=${Math.floor(WIDGET_CACHE_TTL_MS / 1000)}`,
      ...limitHeaders(verdict.remaining),
    },
  });
}

export function widgetPreflight(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept",
      "Access-Control-Max-Age": "86400",
    },
  });
}
