import type { SupabaseClient } from "@supabase/supabase-js";

import { JOB_REGISTRY, judgeJob, type JobRunSummary } from "@/lib/ops/jobs";
import type { FunnelStageRow } from "@/lib/partner-funnel";
import type { AdminOverview, AdminSummary, AdminWindow, EventBreakdownRow } from "./overview";

/**
 * Everything the admin front door shows, read once.
 *
 * The funnel and the event breakdown go through the caller's own RLS-scoped
 * client: both SQL functions are SECURITY DEFINER and re-check
 * `is_platform_admin()` themselves, so a non-admin gets an empty set rather
 * than someone else's numbers. The five summary counts read through the
 * service-role client only after the caller has already been confirmed an
 * admin by the server function above this one.
 *
 * Every summary card is loaded independently and its failure is reported as a
 * failure — a card that could not be read must never render a confident zero.
 */
export async function readAdminOverview(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  windowDays: AdminWindow,
): Promise<AdminOverview> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const funnelPromise = supabase.rpc("funnel_summary_platform", { _window_days: windowDays });
  const breakdownPromise = supabase.rpc("lead_event_breakdown", { _window_days: windowDays });

  const errors: string[] = [];
  const guard = async <T>(what: string, run: () => Promise<T>): Promise<T | null> => {
    try {
      return await run();
    } catch (err) {
      errors.push(`${what}: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  };

  const [funnelRes, breakdownRes, jobs, leadsPending, applicationsPending, payouts, referrals] =
    await Promise.all([
      funnelPromise,
      breakdownPromise,

      guard("Job health", async () => {
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
        const judged = JOB_REGISTRY.map((spec) => judgeJob(spec, byJob.get(spec.job) ?? [], now));
        return {
          total: judged.length,
          healthy: judged.filter((j) => j.verdict === "healthy").length,
          stale: judged.filter((j) => j.verdict === "stale" || j.verdict === "empty").length,
          failing: judged.filter((j) => j.verdict === "failing" || j.verdict === "never-run").length,
        };
      }),

      guard("Intelligence leads", async () => {
        const { count, error } = await supabaseAdmin
          .from("intelligence_leads")
          .select("id", { count: "exact", head: true })
          .eq("status", "open");
        if (error) throw error;
        return count ?? 0;
      }),

      guard("Partner applications", async () => {
        const { count, error } = await supabaseAdmin
          .from("partner_applications")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending");
        if (error) throw error;
        return count ?? 0;
      }),

      guard("Payout queue", async () => {
        const { getStripeEnvironment } = await import("@/lib/stripe");
        const environment = getStripeEnvironment();
        const { readPayoutQueue } = await import("@/lib/partners/payouts.server");
        const rows = await readPayoutQueue(environment);
        return {
          count: rows.length,
          amountUsd: Math.round(rows.reduce((sum, r) => sum + r.amountUsd, 0) * 100) / 100,
          environment: String(environment),
        };
      }),

      guard("Referral split", async () => {
        const { data, error } = await supabaseAdmin
          .from("organizations")
          .select("id, referred_by_partner_id")
          .eq("is_synthetic", false);
        if (error) throw error;
        const rows = data ?? [];
        const partnerReferred = rows.filter((o) => o.referred_by_partner_id).length;
        return {
          total: rows.length,
          direct: rows.length - partnerReferred,
          partnerReferred,
          partnerPct: rows.length ? Math.round((partnerReferred / rows.length) * 100) : 0,
        };
      }),
    ]);

  if (funnelRes.error) throw funnelRes.error;
  if (breakdownRes.error) throw breakdownRes.error;

  const funnel: FunnelStageRow[] = (funnelRes.data ?? [])
    .map(
      (r: {
        stage: string;
        stage_order: number;
        visitors: number;
        rate_from_previous_pct: number | null;
      }): FunnelStageRow => ({
        stage: r.stage,
        stageOrder: Number(r.stage_order),
        visitors: Number(r.visitors),
        ratePct: r.rate_from_previous_pct === null ? null : Number(r.rate_from_previous_pct),
      }),
    )
    .sort((a: FunnelStageRow, b: FunnelStageRow) => a.stageOrder - b.stageOrder);

  const events: EventBreakdownRow[] = (breakdownRes.data ?? []).map(
    (r: {
      event_type: string;
      events: number;
      visitors: number;
      sessions: number;
      legacy_events: number;
      first_at: string | null;
      last_at: string | null;
    }): EventBreakdownRow => ({
      eventType: r.event_type,
      events: Number(r.events),
      visitors: Number(r.visitors),
      sessions: Number(r.sessions),
      legacyEvents: Number(r.legacy_events),
      firstAt: r.first_at,
      lastAt: r.last_at,
    }),
  );

  const summary: AdminSummary = {
    jobs,
    leadsPending,
    applicationsPending,
    payouts,
    referrals,
    errors,
  };

  return {
    windowDays,
    funnel,
    events,
    totals: {
      events: events.reduce((s, e) => s + e.events, 0),
      // Distinct-visitor totals cannot be summed across rows; the funnel's own
      // first stage is not a site-wide total either. This is the honest one:
      // total events, and the legacy rows called out separately.
      visitors: 0,
      sessions: 0,
      legacyEvents: events.reduce((s, e) => s + e.legacyEvents, 0),
    },
    summary,
    readAt: new Date().toISOString(),
  };
}
