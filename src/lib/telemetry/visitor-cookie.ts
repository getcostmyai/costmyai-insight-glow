/**
 * Anonymous visitor cookie.
 *
 * Same shape and same reasoning as the referral cookie: HttpOnly, because
 * nothing in the browser needs to read it, so nothing may. It is a opaque
 * random id with no meaning of its own — it exists only so three events fired
 * by the same person during the same visit can be recognised as one visit, and
 * so a later signup can be joined back to it.
 *
 * One year, because the question it answers ("did this person look at the
 * estimator before they signed up?") has a long tail, and the id carries no
 * personal data to keep.
 */

export const VISITOR_COOKIE = "cma_vid";

/** 1 year, in seconds. */
export const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPlausibleVisitorId(raw: string | null | undefined): boolean {
  return UUID.test((raw ?? "").trim());
}

export function serializeVisitorCookie(id: string, secure: boolean): string {
  return [
    `${VISITOR_COOKIE}=${encodeURIComponent(id)}`,
    "Path=/",
    `Max-Age=${VISITOR_COOKIE_MAX_AGE}`,
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : null,
  ]
    .filter(Boolean)
    .join("; ");
}
