/**
 * Request handlers shared by the widget's routes.
 *
 * Two entry points serve the same document — the pretty `/embed/...` URL we
 * publish in the copy-paste snippet, and the `/api/public/embed/...` mirror that
 * is guaranteed to bypass site auth on every deployment. Both go through this
 * module so the cache, the limiter and the CSP can never diverge between them.
 */
import { readWidgetPayload, WIDGET_CACHE_TTL_MS } from "./widget.server";
import {
  callerIdentity,
  consumeRateLimit,
  rateLimitHeaders,
  RATE_RULES,
  type RateVerdict,
} from "@/lib/rate-limit.server";
import {
  renderWidgetDocument,
  renderWidgetUnavailable,
  widgetDocumentHeaders,
} from "./widget-html.server";

function limitHeaders(verdict: RateVerdict, windowSec: number) {
  return rateLimitHeaders(verdict, windowSec);
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
        "X-RateLimit-Remaining": "0",
      },
    },
  );
}

const nonce = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

export async function serveWidgetDocument(request: Request): Promise<Response> {
  const verdict = await consumeRateLimit(RATE_RULES.widgetDoc, callerIdentity(request));
  if (!verdict.ok) return tooMany(verdict.retryAfterSec, "text/plain; charset=utf-8");


  const url = new URL(request.url);
  const n = nonce();

  /*
   * Past the bounded stale window `readWidgetPayload` refuses to hand back an
   * old copy. On somebody else's page the honest answer is an explicit
   * unavailable card, never last week's market presented as this minute's.
   */
  let payload;
  try {
    payload = await readWidgetPayload();
  } catch {
    return new Response(renderWidgetUnavailable({ origin: url.origin, nonce: n }), {
      status: 200,
      headers: {
        ...widgetDocumentHeaders(n),
        "Cache-Control": "public, max-age=60",
        ...limitHeaders(verdict, RATE_RULES.widgetDoc.windowSec),
      },
    });
  }

  return new Response(renderWidgetDocument(payload, { origin: url.origin, nonce: n }), {
    status: 200,
    headers: {
      ...widgetDocumentHeaders(n),
      ...limitHeaders(verdict, RATE_RULES.widgetDoc.windowSec),
    },

  });
}

export async function serveWidgetData(request: Request): Promise<Response> {
  const verdict = await consumeRateLimit(RATE_RULES.widgetData, callerIdentity(request));
  if (!verdict.ok) return tooMany(verdict.retryAfterSec, "application/json");

  let payload;
  try {
    payload = await readWidgetPayload();
  } catch {
    return new Response(JSON.stringify({ error: "unavailable" }), {
      status: 503,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=60",
        ...limitHeaders(verdict, RATE_RULES.widgetDoc.windowSec),
      },
    });
  }

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
      ...limitHeaders(verdict, RATE_RULES.widgetDoc.windowSec),
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
