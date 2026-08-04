import { Outlet, createFileRoute } from "@tanstack/react-router";

/**
 * The internal demo workspace.
 *
 * TEMPORARY: the owner-only sign-in gate is switched off while auth is broken
 * and a live client demo is running. Restore the `beforeLoad` owner check (and
 * `DEMO_AUTH_BYPASS = false` in src/lib/owner-middleware.ts) afterwards.
 */
export const Route = createFileRoute("/demo")({
  ssr: false,

  head: () => ({
    meta: [
      { title: "Internal workspace — CostMyAI" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "Private internal workspace." },
    ],
  }),

  errorComponent: () => (
    <div className="mx-auto max-w-lg p-16 text-center">
      <h1 className="text-xl font-semibold">Usage data is unavailable</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        We could not read the demo workspace's rollups just now. Refresh in a moment.
      </p>
    </div>
  ),
  notFoundComponent: () => (
    <div className="mx-auto max-w-lg p-16 text-center text-sm text-muted-foreground">
      Workspace not found.
    </div>
  ),
  component: () => <Outlet />,
});
