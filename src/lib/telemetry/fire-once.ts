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
