/**
 * First-touch referral cookie.
 *
 * One cookie, one job: remember which partner code brought a visitor here so
 * that the workspace they create later can be attributed to that partner.
 *
 * Deliberate choices:
 *  - First touch wins. If the cookie is already present, a later /r/CODE click
 *    inside the window is a no-op. A partner cannot overwrite another partner's
 *    referral by getting the second click.
 *  - 60 days. Long enough to survive an evaluation cycle, short enough that it
 *    is a referral rather than a permanent claim on a stranger.
 *  - HttpOnly. Nothing in the browser needs to read it, so nothing may.
 *  - The cookie holds the *code*, not a partner id. Attribution is still
 *    resolved server-side through attach_referral, so every existing guard
 *    (active partner only, owner only, never re-attribute) still applies at the
 *    moment it matters.
 */

export const REFERRAL_COOKIE = "cma_ref";

/** 60 days, in seconds. */
export const REFERRAL_COOKIE_MAX_AGE = 60 * 60 * 24 * 60;

/** Codes are short, opaque and case-insensitive; anything else is not a code. */
const CODE = /^[A-Za-z0-9._-]{3,40}$/;

export function isPlausibleCode(raw: string | null | undefined): boolean {
  return CODE.test((raw ?? "").trim());
}

/** Read one cookie out of a raw `Cookie:` header. */
export function readCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

export function readReferralCookie(header: string | null | undefined): string | null {
  const value = readCookie(header, REFERRAL_COOKIE);
  return value && isPlausibleCode(value) ? value.trim() : null;
}

export function serializeReferralCookie(code: string, secure: boolean): string {
  return [
    `${REFERRAL_COOKIE}=${encodeURIComponent(code.trim())}`,
    "Path=/",
    `Max-Age=${REFERRAL_COOKIE_MAX_AGE}`,
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : null,
  ]
    .filter(Boolean)
    .join("; ");
}

export function clearReferralCookie(secure: boolean): string {
  return [
    `${REFERRAL_COOKIE}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : null,
  ]
    .filter(Boolean)
    .join("; ");
}

export function isSecureRequest(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}
