import { effectivePlan, type SubscriptionState } from "@/lib/billing/entitlement";
import type { PlanTier } from "@/lib/engine/types";
import { classifyOrg, type CustomerDirectory, type CustomerRow, type FunnelTouch } from "./customers";

/**
 * The customer directory, read once.
 *
 * Batched server-side read rather than a new SECURITY DEFINER SQL function,
 * for two reasons. First, the plan shown must be the same answer every gate
 * gives, and that rule lives in TypeScript (`effectivePlan` in
 * billing/entitlement.ts) — re-implementing it in SQL would create a second
 * copy of the one rule that decides who has paid for what. Second, the contact
 * email lives in `auth.users`, which is not reachable through PostgREST at
 * all, so a service-credential read is required regardless. The caller is
 * confirmed a platform admin by the server function above this one before a
 * single row is read.
 *
 * Everything here is a read. There is no write-path to a customer account in
 * this module, deliberately.
 */
export async function readCustomerDirectory(environment: string): Promise<CustomerDirectory> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [orgsRes, subsRes, rollupsRes, membershipsRes, partnersRes, profilesRes] =
    await Promise.all([
      supabaseAdmin
        .from("organizations")
        .select(
          "id, name, slug, plan, created_at, created_by, is_synthetic, referred_by_partner_id, referred_at, first_visitor_id",
        )
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("subscriptions")
        .select("org_id, plan, status, current_period_end, cancel_at_period_end, environment, created_at")
        .order("created_at", { ascending: false }),
      // Exactly the shape confirmed in diagnosis: day buckets only (hour rows
      // would double-count the same usage) and non-synthetic only.
      supabaseAdmin
        .from("usage_rollups")
        .select("org_id, cost_usd, bucket_start")
        .eq("granularity", "day")
        .eq("is_synthetic", false)
        .limit(100_000),
      supabaseAdmin.from("memberships").select("org_id"),
      supabaseAdmin.from("partners").select("id, name, referral_code"),
      supabaseAdmin.from("profiles").select("id, full_name"),
    ]);

  if (orgsRes.error) throw orgsRes.error;
  if (subsRes.error) throw subsRes.error;
  if (rollupsRes.error) throw rollupsRes.error;

  const allOrgs = orgsRes.data ?? [];
  const real = allOrgs.filter((o) => !o.is_synthetic);
  const syntheticCount = allOrgs.length - real.length;

  // Contact email. auth.users is not exposed through the Data API, so this is
  // the only real path to it.
  const emailById = new Map<string, string>();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const u of data.users) if (u.email) emailById.set(u.id, u.email);
    if (data.users.length < 200) break;
  }

  const nameById = new Map<string, string | null>(
    (profilesRes.data ?? []).map((p) => [p.id as string, (p.full_name as string | null) ?? null]),
  );

  const seats = new Map<string, number>();
  for (const m of membershipsRes.data ?? []) {
    const id = m.org_id as string;
    seats.set(id, (seats.get(id) ?? 0) + 1);
  }

  const partnerById = new Map(
    (partnersRes.data ?? []).map((p) => [
      p.id as string,
      { id: p.id as string, name: p.name as string, code: p.referral_code as string },
    ]),
  );

  const cutoff = Date.now() - 30 * 86_400_000;
  const spend = new Map<string, { d30: number; life: number; last: string | null }>();
  for (const r of rollupsRes.data ?? []) {
    const id = r.org_id as string;
    const cost = Number(r.cost_usd ?? 0);
    const at = String(r.bucket_start);
    const cur = spend.get(id) ?? { d30: 0, life: 0, last: null };
    cur.life += cost;
    if (new Date(at).getTime() >= cutoff) cur.d30 += cost;
    if (!cur.last || at > cur.last) cur.last = at;
    spend.set(id, cur);
  }

  // Newest subscription per org, per environment.
  const subHere = new Map<string, SubscriptionState>();
  const subOther = new Map<string, { environment: string; plan: PlanTier; status: string }>();
  for (const s of subsRes.data ?? []) {
    const id = s.org_id as string;
    const state: SubscriptionState = {
      plan: s.plan as PlanTier,
      status: s.status as string,
      currentPeriodEnd: (s.current_period_end as string | null) ?? null,
      cancelAtPeriodEnd: Boolean(s.cancel_at_period_end),
    };
    if (s.environment === environment) {
      if (!subHere.has(id)) subHere.set(id, state);
    } else if (!subOther.has(id)) {
      subOther.set(id, {
        environment: String(s.environment),
        plan: state.plan,
        status: state.status,
      });
    }
  }

  const excluded = { synthetic: syntheticCount, testHarness: 0, noContact: 0 };
  const keep: Array<{ org: (typeof real)[number]; email: string; internal: boolean }> = [];
  for (const org of real) {
    const email = org.created_by ? (emailById.get(org.created_by as string) ?? null) : null;
    const verdict = classifyOrg(email);
    if (verdict === "test_harness") excluded.testHarness += 1;
    else if (verdict === "no_contact") excluded.noContact += 1;
    else keep.push({ org, email: email as string, internal: verdict === "internal" });
  }

  // Prior funnel activity, only for the workspaces that survive filtering.
  const visitorIds = keep
    .map((k) => k.org.first_visitor_id as string | null)
    .filter((v): v is string => Boolean(v));
  const funnelByVisitor = new Map<string, FunnelTouch[]>();
  if (visitorIds.length) {
    const { data, error } = await supabaseAdmin
      .from("lead_events")
      .select("visitor_id, event_type, created_at")
      .in("visitor_id", visitorIds)
      .eq("is_synthetic", false)
      .order("created_at", { ascending: true })
      .limit(5_000);
    if (error) throw error;
    for (const e of data ?? []) {
      const v = String(e.visitor_id);
      funnelByVisitor.set(v, [
        ...(funnelByVisitor.get(v) ?? []),
        { eventType: String(e.event_type), at: String(e.created_at) },
      ]);
    }
  }

  const rows: CustomerRow[] = keep.map(({ org, email, internal }) => {
    const id = org.id as string;
    const money = spend.get(id) ?? { d30: 0, life: 0, last: null };
    const sub = subHere.get(id) ?? null;
    const recordedPlan = org.plan as PlanTier;
    const partnerId = org.referred_by_partner_id as string | null;
    return {
      orgId: id,
      name: org.name as string,
      slug: org.slug as string,
      createdAt: String(org.created_at),
      email,
      fullName: org.created_by ? (nameById.get(org.created_by as string) ?? null) : null,
      internal,
      seats: seats.get(id) ?? 0,
      effectivePlan: effectivePlan(recordedPlan, sub),
      recordedPlan,
      subscription: sub
        ? { plan: sub.plan, status: sub.status, currentPeriodEnd: sub.currentPeriodEnd }
        : null,
      otherEnvSubscription: subOther.get(id) ?? null,
      spend30dUsd: round4(money.d30),
      spendLifetimeUsd: round4(money.life),
      lastActivityAt: money.last,
      firstVisitorId: (org.first_visitor_id as string | null) ?? null,
      funnel: org.first_visitor_id
        ? (funnelByVisitor.get(org.first_visitor_id as string) ?? [])
        : [],
      partner: partnerId ? (partnerById.get(partnerId) ?? null) : null,
      referredAt: (org.referred_at as string | null) ?? null,
    };
  });

  return { environment, rows, excluded, readAt: new Date().toISOString() };
}

function round4(n: number) {
  return Math.round(n * 10_000) / 10_000;
}
