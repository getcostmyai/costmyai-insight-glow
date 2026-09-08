import { createFileRoute, Outlet } from "@tanstack/react-router";

import { MarketingShell } from "@/components/marketing/MarketingShell";

/**
 * Pathless layout for every public marketing page.
 *
 * The nav and footer used to be rendered by each route component, so moving
 * between two marketing pages unmounted the entire chrome and mounted a fresh
 * copy: roughly 27 Link components rebuilt for a header that never changes.
 * Mounting the shell here keeps one instance alive across those navigations.
 * A pathless segment contributes nothing to the URL, so every public path is
 * exactly what it was, and each child route keeps its own head, canonical and
 * loader.
 */
export const Route = createFileRoute("/_marketing")({
  component: MarketingLayout,
});

function MarketingLayout() {
  return (
    <MarketingShell>
      <Outlet />
    </MarketingShell>
  );
}
