import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { getDemoAccess } from "@/lib/demo-access.functions";

/**
 * The demo workspace — Robin, or a real, currently-active partner.
 *
 * The route is client-rendered (`ssr: false`) because the Supabase session
 * lives in per-origin localStorage, which the server cannot read. The real
 * enforcement is server-side (`requireDemoAccess` on every data function); this
 * gate only avoids rendering a shell that could never load data. Which
 * workspace a caller actually reads is decided server-side too.
 */
export const Route = createFileRoute("/demo")({
  ssr: false,

  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth", search: { next: location.href } });
    }
    const { audience } = await getDemoAccess();
    if (!audience) {
      throw new Error("Forbidden: this workspace is restricted");
    }
    return { demoAudience: audience };
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
        The demo workspace is open to CostMyAI and to currently active partners. If your partnership
        was recently approved, sign out and back in; if it is on hold, access resumes when it does.
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
