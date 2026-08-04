import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { isOwner } from "@/lib/access";

/**
 * The internal demo workspace — Robin only.
 *
 * The route is client-rendered (`ssr: false`) because the Supabase session
 * lives in per-origin localStorage, which the server cannot read. The real
 * enforcement is server-side (`requireOwner` on every data function); this
 * gate only avoids rendering a shell that could never load data.
 */
export const Route = createFileRoute("/demo")({
  ssr: false,

  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth", search: { next: location.href } });
    }
    if (!isOwner(data.user.id)) {
      throw new Error("Forbidden: this workspace is restricted");
    }
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
      <h1 className="text-xl font-semibold">This workspace is restricted</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The internal demo workspace is limited to its owner.
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
