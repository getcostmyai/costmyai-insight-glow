import { useRouterState } from "@tanstack/react-router";

/**
 * The origin every absolute URL in the UI is built from.
 *
 * The root route resolves it once from the real request during SSR and puts it
 * in router context, so the very first rendered HTML already carries absolute
 * share URLs — no hydration gate, no empty-string window.
 *
 * The fallback only matters if that context value is ever missing, which can
 * only happen in the browser (a pure client-side render). `window` is
 * necessarily available by then, so the fallback is safe and never runs on the
 * server.
 */
export function useOrigin(): string {
  const fromContext = useRouterState({
    select: (s) => (s.matches[0]?.context as { origin?: string } | undefined)?.origin,
  });
  if (fromContext) return fromContext;
  return typeof window === "undefined" ? "" : window.location.origin;
}
