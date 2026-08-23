import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { type JobHealth } from "@/lib/ops/jobs";

/**
 * The jobs board.
 *
 * Same registry and same verdicts as `scripts/audit/cron-health.ts`, so the
 * screen and the script cannot disagree. Platform admin only — it names
 * internal jobs and carries error text.
 *
 * The read is `collectJobHealth`: one bounded query per job, shared with the
 * alert sweep. A single global `limit(400)` used to serve this page, and a job
 * running once a month fell out of that window entirely behind a job running
 * every minute — the board then called a perfectly healthy job "never run".
 */
export const listJobHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ jobs: JobHealth[]; readAt: string }> => {
    const { data: isAdmin, error: adminError } = await context.supabase.rpc("is_platform_admin");
    if (adminError) throw adminError;
    if (!isAdmin) throw new Error("Not found");

    const { collectJobHealth } = await import("@/lib/ops/alerts.server");
    const now = Date.now();
    return { jobs: await collectJobHealth(now), readAt: new Date(now).toISOString() };
  });

