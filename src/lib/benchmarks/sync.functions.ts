import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Manual trigger for the Artificial Analysis sync.
 *
 * The sync writes platform-wide tables (`benchmarks`, `benchmark_margins`) that
 * every workspace reads, so the authority to run it cannot come from a
 * workspace id the caller supplies — managing your own workspace must not grant
 * a global write. The actor is re-derived from their bearer token and must be a
 * platform admin.
 */
export const runBenchmarkSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin, error } = await context.supabase.rpc("is_platform_admin");
    if (error) throw error;
    if (!isAdmin) throw new Response("Forbidden", { status: 403 });

    const { syncArtificialAnalysis } = await import("./aa-sync.server");
    return syncArtificialAnalysis();
  });
