import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { JOB_REGISTRY, judgeJob, type JobHealth, type JobRunSummary } from "@/lib/ops/jobs";

/**
 * The jobs board.
 *
 * Same registry and same verdicts as `scripts/audit/cron-health.ts`, so the
 * screen and the script cannot disagree. Platform admin only — it names
 * internal jobs and carries error text.
 */
export const listJobHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ jobs: JobHealth[]; readAt: string }> => {
    const { data: isAdmin, error: adminError } = await context.supabase.rpc("is_platform_admin");
    if (adminError) throw adminError;
    if (!isAdmin) throw new Error("Not found");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("sync_runs")
      .select("job, started_at, outcome, rows_written, error")
      .in(
        "job",
        JOB_REGISTRY.map((j) => j.job),
      )
      .order("started_at", { ascending: false })
      .limit(400);
    if (error) throw error;

    const byJob = new Map<string, JobRunSummary[]>();
    for (const row of data ?? []) {
      const job = String(row.job);
      byJob.set(job, [
        ...(byJob.get(job) ?? []),
        {
          startedAt: String(row.started_at),
          outcome: row.outcome ?? null,
          rowsWritten: row.rows_written ?? null,
          error: row.error ?? null,
        },
      ]);
    }

    const now = Date.now();
    return {
      jobs: JOB_REGISTRY.map((spec) => judgeJob(spec, byJob.get(spec.job) ?? [], now)),
      readAt: new Date(now).toISOString(),
    };
  });
