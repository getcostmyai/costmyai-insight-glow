/**
 * First-touch acquisition cookie.
 *
 * One cookie, one job: remember where a visitor originally came from, so a
 * signup weeks later can be attributed to the channel that produced it. Same
 * rules as `cma_ref`, deliberately:
 *
 *  - First touch wins. If the cookie is already present, a later landing with
 *    different UTMs is a no-op. A campaign cannot claim a visitor another
 *    channel already brought.
 *  - 60 days, matching the referral window.
 *  - HttpOnly, SameSite=Lax, Path=/, Secure on https. Nothing in the browser
 *    needs to read it, so nothing may.
 *
 * What is stored is deliberately narrower than what the request carries:
 *
 *  - Referrer is reduced to its **origin** (scheme + host). The path and query
 *    of a referrer are where the leak lives — an internal search results page
 *    carries the searcher's terms — and "google.com sent them" is the whole
 *    observation we want.
 *  - Only `utm_source`, `utm_medium` and `utm_campaign` are read.
 *    `utm_content` and `utm_term` are deliberately skipped: term in particular
 *    is keyword text, i.e. free text with no owner, and neither answers a
 *    question this funnel asks.
 *  - Every value is clamped to an enum-shaped allowlist pattern and dropped,
 *    not echoed, when it does not match.
 */

export const SOURCE_COOKIE = "cma_src";

/** 60 days, matching the referral cookie. */
export const SOURCE_COOKIE_MAX_AGE = 60 * 60 * 24 * 60;

/** UTM values in the wild: slug characters. Anything else is not a campaign. */
const UTM = /^[A-Za-z0-9._\-+ ]{1,64}$/;

export interface FirstTouchSource {
  /** Referrer origin, scheme + host only. */
  origin: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
}

export const EMPTY_SOURCE: FirstTouchSource = {
  origin: null,
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
};

export function isEmptySource(s: FirstTouchSource): boolean {
  return !s.origin && !s.utmSource && !s.utmMedium && !s.utmCampaign;
}

/** Reduce a raw `Referer` header to scheme + host, or null. */
export function referrerOrigin(raw: string | null | undefined, selfHost?: string): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    // Same-site navigation is not an acquisition source.
    if (selfHost && url.host === selfHost) return null;
    return `${url.protocol}//${url.host}`.slice(0, 200);
  } catch {
    return null;
  }
}

function clampUtm(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  return UTM.test(value) ? value : null;
}

/** Read the first-touch fields out of a landing URL + referrer header. */
export function readFirstTouch(landingUrl: string, referer: string | null): FirstTouchSource {
  let params: URLSearchParams;
  let host: string | undefined;
  try {
    const url = new URL(landingUrl);
    params = url.searchParams;
    host = url.host;
  } catch {
    params = new URLSearchParams();
  }
  return {
    origin: referrerOrigin(referer, host),
    utmSource: clampUtm(params.get("utm_source")),
    utmMedium: clampUtm(params.get("utm_medium")),
    utmCampaign: clampUtm(params.get("utm_campaign")),
  };
}

export function serializeSource(source: FirstTouchSource): string {
  const q = new URLSearchParams();
  if (source.origin) q.set("o", source.origin);
  if (source.utmSource) q.set("s", source.utmSource);
  if (source.utmMedium) q.set("m", source.utmMedium);
  if (source.utmCampaign) q.set("c", source.utmCampaign);
  return q.toString();
}

/** Parse a stored cookie value back, re-validating every field. */
export function parseSource(raw: string | null | undefined): FirstTouchSource | null {
  if (!raw) return null;
  const q = new URLSearchParams(raw);
  const source: FirstTouchSource = {
    origin: referrerOrigin(q.get("o")),
    utmSource: clampUtm(q.get("s")),
    utmMedium: clampUtm(q.get("m")),
    utmCampaign: clampUtm(q.get("c")),
  };
  return isEmptySource(source) ? null : source;
}

export function serializeSourceCookie(source: FirstTouchSource, secure: boolean): string {
  return [
    `${SOURCE_COOKIE}=${encodeURIComponent(serializeSource(source))}`,
    "Path=/",
    `Max-Age=${SOURCE_COOKIE_MAX_AGE}`,
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : null,
  ]
    .filter(Boolean)
    .join("; ");
}
