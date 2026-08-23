/**
 * Browser-side de-duplication for "once per page view" telemetry.
 *
 * A `useRef` guard is not enough: a route component can mount more than once
 * for a single visit (hydration, a Suspense boundary re-rendering after its
 * query resolves), and each mount gets a fresh ref — which is exactly how a
 * single visit produced two `partner_apply_started` rows in testing.
 *
 * Module scope survives those remounts. The window keeps the guard honest: a
 * genuine return to the same page later in the same session is a real second
 * view and is allowed to fire again.
 */
const lastFired = new Map<string, number>();

/** Default window: longer than any remount storm, shorter than a real revisit. */
export const FIRE_ONCE_WINDOW_MS = 30_000;

export function shouldFire(
  key: string,
  now: number = Date.now(),
  windowMs: number = FIRE_ONCE_WINDOW_MS,
): boolean {
  const previous = lastFired.get(key);
  if (previous !== undefined && now - previous < windowMs) return false;
  lastFired.set(key, now);
  return true;
}

/** Test seam only — production code never clears the map. */
export function resetFireOnce(): void {
  lastFired.clear();
}

/**
 * Same guard, but surviving a full document load.
 *
 * Module scope dies on reload, which is fine for in-page remount storms but
 * not for page views: a reload or a back-navigation that re-fetches the
 * document would fire a second `page_viewed` for the same page seconds apart.
 * sessionStorage is scoped to the tab and to the sitting, which is exactly the
 * lifetime this guard wants. Storage failures fall back to the in-memory map
 * rather than dropping the event.
 */
export function shouldFirePersisted(
  key: string,
  now: number = Date.now(),
  windowMs: number = FIRE_ONCE_WINDOW_MS,
): boolean {
  if (!shouldFire(key, now, windowMs)) return false;
  try {
    const storageKey = `costmyai.fire-once:${key}`;
    const previous = Number(window.sessionStorage.getItem(storageKey));
    if (Number.isFinite(previous) && previous > 0 && now - previous < windowMs) return false;
    window.sessionStorage.setItem(storageKey, String(now));
  } catch {
    /* locked-down storage: the in-memory guard above still applies */
  }
  return true;
}
