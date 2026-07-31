import { createServerFn } from "@tanstack/react-start";

/**
 * Manual trigger for the Artificial Analysis sync.
 * Admin-only: the caller must hold an owner/admin role in the workspace, checked
 * through their own RLS-scoped client before any service-role work happens.
 */
export const runBenchmarkSync = createServerFn({ method: "POST" })
  .inputValidator((data: { orgId: string }) => data)
  .handler(async ({ data }) => {
    const { requireSupabaseAuth } = await import("@/integrations/supabase/auth-middleware").catch(
      () => ({ requireSupabaseAuth: null }),
    );
    void requireSupabaseAuth;
    const { supabase } = await import("@/integrations/supabase/client.server").then(async (m) => ({
      supabase: m.supabaseAdmin,
    }));

    const { data: isManager, error } = await supabase.rpc("is_org_manager", {
      _org_id: data.orgId,
    });
    if (error) throw error;
    if (!isManager) throw new Error("Forbidden");

    const { syncArtificialAnalysis } = await import("./aa-sync.server");
    return syncArtificialAnalysis();
  });
