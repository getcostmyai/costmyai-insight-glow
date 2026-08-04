import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { ROBIN_USER_ID } from "@/lib/access";

/**
 * The internal demo workspace — owner-only, permanently.
 *
 * Client-only because the session lives in browser storage. This gate decides
 * what renders; the snapshot server function re-checks the bearer token and the
 * user id itself, so nothing here is load-bearing for privacy.
 */
export const Route = createFileRoute("/demo")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    if (data.user.id !== ROBIN_USER_ID) throw redirect({ to: "/" });
  },
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
