import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Manual trigger for the Artificial Analysis sync.
 * Admin-only: the caller's own RLS-scoped client answers whether they manage the
 * workspace, before any service-role work is allowed to start.
 */
export const runBenchmarkSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orgId: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: isManager, error } = await context.supabase.rpc("is_org_manager", {
      _org_id: data.orgId,
    });
    if (error) throw error;
    if (!isManager) throw new Error("Forbidden");

    const { syncArtificialAnalysis } = await import("./aa-sync.server");
    return syncArtificialAnalysis();
  });
