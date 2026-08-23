/**
 * Page-path sanitization for `page_viewed`.
 *
 * Same discipline as `sanitizeSearchQuery` and the Intelligence `cardId`
 * clamp: strip control characters, drop anything that is not the shape a real
 * route path has, cap the length. A path the validator cannot construct is
 * dropped rather than echoed into `lead_events`.
 *
 * Query strings and hashes are removed rather than rejected — they are the one
 * part of a URL that can carry a stranger's typo'd secret, and the observation
 * we actually want ("which page") does not need them.
 */

/** Longest path ever written to `lead_events`. */
export const PAGE_PATH_MAX = 200;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;

/** Real route paths only: slug characters, slashes, percent-escapes. */
const PATH = /^\/[A-Za-z0-9\-._~/%@+]*$/;

/**
 * The router's own route id for this match (`/blog/$slug`), which is a closed,
 * known set generated from `src/routes`. Bounded the same way.
 */
const ROUTE_ID = /^\/[A-Za-z0-9\-._$/]{0,120}$/;

export function sanitizePagePath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let value = raw.replace(CONTROL_CHARS, "").trim();
  if (!value) return null;
  const cut = value.search(/[?#]/);
  if (cut !== -1) value = value.slice(0, cut);
  if (value.length > 1 && value.endsWith("/")) value = value.slice(0, -1);
  if (!value.startsWith("/")) return null;
  value = value.slice(0, PAGE_PATH_MAX);
  return PATH.test(value) ? value : null;
}

export function sanitizeRouteId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.replace(CONTROL_CHARS, "").trim();
  if (!value) return null;
  return ROUTE_ID.test(value) ? value : null;
}
