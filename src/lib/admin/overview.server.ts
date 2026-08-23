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

  const [
    funnelRes,
    breakdownRes,
    jobs,
    leadsPending,
    applicationsPending,
    payouts,
    referrals,
    customers,
  ] =
    await Promise.all([
      funnelPromise,
      breakdownPromise,

      guard("Job health", async () => {
        // One bounded read per job (shared with the alert sweep). A single
        // global window let a monthly job be crowded out by a minutely one and
        // reported as "never run".
        const { collectJobHealth } = await import("@/lib/ops/alerts.server");
        const judged = await collectJobHealth(Date.now());
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

      // Same filter the directory itself applies, so the card and the page can
      // never disagree about who counts as a customer.
      guard("Customer directory", async () => {
        const { classifyOrg } = await import("./customers");
        const { data, error } = await supabaseAdmin
          .from("organizations")
          .select("created_by")
          .eq("is_synthetic", false);
        if (error) throw error;
        const emails = new Map<string, string>();
        for (let page = 1; page <= 20; page += 1) {
          const res = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
          if (res.error) throw res.error;
          for (const u of res.data.users) if (u.email) emails.set(u.id, u.email);
          if (res.data.users.length < 200) break;
        }
        let shown = 0;
        let internal = 0;
        let excluded = 0;
        for (const org of data ?? []) {
          const verdict = classifyOrg(
            org.created_by ? (emails.get(org.created_by as string) ?? null) : null,
          );
          if (verdict === "customer") shown += 1;
          else if (verdict === "internal") {
            shown += 1;
            internal += 1;
          } else excluded += 1;
        }
        return { shown, internal, excluded };
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

  // Site-wide distinct visitor and session counts. Distinct counts cannot be
  // summed across event types, so they are counted once over the raw rows in
  // the window. Rows with no session id pre-date session tracking and are
  // bucketed separately rather than counted as sessions.
  const distinct = await guard("Visitor totals", async () => {
    const { data, error } = await supabaseAdmin
      .from("lead_events")
      .select("visitor_id, session_id")
      .eq("is_synthetic", false)
      .gte("created_at", new Date(Date.now() - windowDays * 86_400_000).toISOString())
      .limit(50_000);
    if (error) throw error;
    const visitors = new Set<string>();
    const sessions = new Set<string>();
    for (const row of data ?? []) {
      if (row.visitor_id) visitors.add(String(row.visitor_id));
      if (row.session_id) sessions.add(String(row.session_id));
    }
    return { visitors: visitors.size, sessions: sessions.size };
  });

  const summary: AdminSummary = {
    jobs,
    leadsPending,
    applicationsPending,
    payouts,
    referrals,
    customers,
    errors,
  };

  return {
    windowDays,
    funnel,
    events,
    totals: {
      events: events.reduce((s, e) => s + e.events, 0),
      visitors: distinct?.visitors ?? 0,
      sessions: distinct?.sessions ?? 0,
      legacyEvents: events.reduce((s, e) => s + e.legacyEvents, 0),
    },
    summary,
    readAt: new Date().toISOString(),
  };
}
