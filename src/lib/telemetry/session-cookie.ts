/**
 * Session cookie — groups events into one visit.
 *
 * Same shape and same reasoning as the visitor cookie (HttpOnly, SameSite=Lax,
 * Path=/, Secure on https): nothing in the browser needs to read it, so nothing
 * may. The difference is lifetime. `cma_vid` answers "is this the same person";
 * `cma_sid` answers "is this the same sitting", so it is not given a fixed long
 * life. It carries its own last-seen stamp and dies after 30 minutes of
 * inactivity:
 *
 *  - Max-Age is re-issued at 30 minutes on every event, so an idle browser drops
 *    the cookie by itself.
 *  - The value is `<uuid>.<lastSeenMs>` and the staleness check is *also* made
 *    server-side, so a client that keeps an expired cookie (or replays an old
 *    one) still gets a fresh session id rather than stitching two visits
 *    together.
 */

export const SESSION_COOKIE = "cma_sid";

/** 30 minutes of inactivity ends the session. */
export const SESSION_IDLE_MS = 30 * 60 * 1000;
export const SESSION_COOKIE_MAX_AGE = SESSION_IDLE_MS / 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SessionCookieValue = { id: string; lastSeenMs: number };

export function parseSessionCookie(raw: string | null | undefined): SessionCookieValue | null {
  const value = (raw ?? "").trim();
  const dot = value.indexOf(".");
  if (dot === -1) return null;
  const id = value.slice(0, dot);
  const stamp = Number(value.slice(dot + 1));
  if (!UUID.test(id)) return null;
  if (!Number.isFinite(stamp) || stamp <= 0) return null;
  return { id, lastSeenMs: stamp };
}

export function serializeSessionCookie(
  value: SessionCookieValue,
  secure: boolean,
): string {
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(`${value.id}.${value.lastSeenMs}`)}`,
    "Path=/",
    `Max-Age=${SESSION_COOKIE_MAX_AGE}`,
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : null,
  ]
    .filter(Boolean)
    .join("; ");
}

/**
 * Decide the session for this request: continue the one in the cookie when the
 * previous event was under 30 minutes ago, otherwise start a new one. Always
 * returns the `Set-Cookie` value, because even a continued session must have
 * its idle window slid forward.
 */
export function nextSession(
  cookieValue: string | null | undefined,
  now: number,
  secure: boolean,
): { id: string; isNew: boolean; setCookie: string } {
  const prev = parseSessionCookie(cookieValue);
  const alive = prev !== null && now - prev.lastSeenMs < SESSION_IDLE_MS && now >= prev.lastSeenMs;
  const id = alive ? prev!.id : crypto.randomUUID();
  return {
    id,
    isNew: !alive,
    setCookie: serializeSessionCookie({ id, lastSeenMs: now }, secure),
  };
}
