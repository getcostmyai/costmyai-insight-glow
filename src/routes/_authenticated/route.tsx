import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";

/**
 * The gate for everything that reads a real workspace.
 *
 * Client-only on purpose: the session lives in browser storage, so a
 * server-rendered check would bounce signed-in users on every hard refresh.
 * Server functions behind this gate re-verify the bearer token themselves —
 * this only decides what to render.
 */
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: () => <Outlet />,
});
