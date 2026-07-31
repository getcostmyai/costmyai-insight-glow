import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Partner / affiliate program.
 *
 * A partner is a separate identity surface from a workspace: the same person
 * may own a workspace and belong to a partner account, and neither grants
 * anything in the other. Every read below runs through the caller's own
 * RLS-scoped client, so a partner id in a request body can only ever return
 * rows the caller already had the right to see. The two things that decide
 * money — attribution and the commission rate — are computed in the database:
 * attribution is frozen for the lifetime of the workspace, and the ledger is
 * written only by the payment webhook under service credentials.
 */

const UUID = /^[0-9a-f-]{36}$/i;

export interface PartnerTier {
  tier: number;
  name: string;
  minLifetimeReferredUsd: number;
  ratePct: number;
}

export interface PartnerSummary {
  id: string;
  name: string;
  referralCode: string;
  contactEmail: string | null;
  status: "pending" | "active" | "suspended";
  role: "owner" | "member";
  /** Sum of referred revenue that has not been clawed back. */
  lifetimeRevenueUsd: number;
  earnedTier: number;
  effectiveTier: number;
  /** True when a platform admin has pinned the tier away from what was earned. */
  overridden: boolean;
  ratePct: number;
  tiers: PartnerTier[];
  nextTier: PartnerTier | null;
  /** Dollars of referred revenue still needed to reach `nextTier`. */
  toNextTierUsd: number | null;
}

export interface ReferredWorkspace {
  id: string;
  name: string;
  plan: string;
  referredAt: string | null;
}

export interface CommissionRow {
  id: string;
  orgId: string;
  invoiceId: string;
  periodStart: string | null;
  periodEnd: string | null;
  revenueUsd: number;
  ratePct: number;
  commissionUsd: number;
  status: "pending" | "approved" | "paid" | "clawed_back";
  createdAt: string;
  paidAt: string | null;
}

export interface PartnerDashboard {
  partner: PartnerSummary;
  referrals: ReferredWorkspace[];
  commissions: CommissionRow[];
  totals: {
    earnedUsd: number;
    paidUsd: number;
    /** Earned but not yet paid out. */
    outstandingUsd: number;
  };
}

/** Null when the signed-in person is not part of any partner account. */
export const getMyPartner = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PartnerDashboard | null> => {
    const { supabase, userId } = context;

    const membership = await supabase
      .from("partner_users")
      .select("partner_id, role")
      .eq("user_id", userId)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (membership.error) throw membership.error;
    if (!membership.data) return null;

    const partnerId = membership.data.partner_id;

    const [partner, tiers, revenue, earned, effective, referrals, ledger] = await Promise.all([
      supabase
        .from("partners")
        .select("id, name, referral_code, contact_email, status, tier_override")
        .eq("id", partnerId)
        .single(),
      supabase.from("partner_tiers").select("tier, name, min_lifetime_referred_usd, rate_pct").order("tier"),
      supabase.rpc("partner_lifetime_revenue", { _partner_id: partnerId }),
      supabase.rpc("partner_earned_tier", { _partner_id: partnerId }),
      supabase.rpc("partner_effective_tier", { _partner_id: partnerId }),
      // Attribution is readable to the partner, but a referred workspace's
      // spend never is. The partner is not a member of those workspaces and
      // cannot read the table at all — this function returns the three facts
      // they are entitled to and nothing else.
      supabase.rpc("partner_referrals", { _partner_id: partnerId }),
      supabase
        .from("commission_ledger")
        .select(
          "id, org_id, invoice_id, period_start, period_end, revenue_usd, rate_pct, commission_usd, status, created_at, paid_at",
        )
        .eq("partner_id", partnerId)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    if (partner.error) throw partner.error;

    const tierRows: PartnerTier[] = (tiers.data ?? []).map((t) => ({
      tier: t.tier,
      name: t.name,
      minLifetimeReferredUsd: Number(t.min_lifetime_referred_usd),
      ratePct: Number(t.rate_pct),
    }));
    const lifetimeRevenueUsd = Number(revenue.data ?? 0);
    const effectiveTier = Number(effective.data ?? 0);
    const earnedTier = Number(earned.data ?? 0);
    const current = tierRows.find((t) => t.tier === effectiveTier) ?? tierRows[0];
    const next = tierRows.find((t) => t.tier === earnedTier + 1) ?? null;

    const commissions: CommissionRow[] = (ledger.data ?? []).map((c) => ({
      id: c.id,
      orgId: c.org_id,
      invoiceId: c.invoice_id,
      periodStart: c.period_start,
      periodEnd: c.period_end,
      revenueUsd: Number(c.revenue_usd),
      ratePct: Number(c.rate_pct),
      commissionUsd: Number(c.commission_usd),
      status: c.status,
      createdAt: c.created_at,
      paidAt: c.paid_at,
    }));

    const live = commissions.filter((c) => c.status !== "clawed_back");
    const earnedUsd = live.reduce((sum, c) => sum + c.commissionUsd, 0);
    const paidUsd = live
      .filter((c) => c.status === "paid")
      .reduce((sum, c) => sum + c.commissionUsd, 0);

    return {
      partner: {
        id: partner.data.id,
        name: partner.data.name,
        referralCode: partner.data.referral_code,
        contactEmail: partner.data.contact_email,
        status: partner.data.status,
        role: membership.data.role,
        lifetimeRevenueUsd,
        earnedTier,
        effectiveTier,
        overridden: partner.data.tier_override !== null,
        ratePct: current?.ratePct ?? 0,
        tiers: tierRows,
        nextTier: next,
        toNextTierUsd: next ? Math.max(0, next.minLifetimeReferredUsd - lifetimeRevenueUsd) : null,
      },
      referrals: (referrals.data ?? []).map((o) => ({
        id: o.id,
        name: o.name,
        plan: o.plan as string,
        referredAt: o.referred_at,
      })),
      commissions,
      totals: {
        earnedUsd: round2(earnedUsd),
        paidUsd: round2(paidUsd),
        outstandingUsd: round2(earnedUsd - paidUsd),
      },
    };
  });

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * A workspace owner claims a referral code once. The database refuses a second
 * claim and refuses ever moving the workspace to a different partner.
 */
export const attachReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orgId: string; code: string }) => {
    if (!UUID.test(data?.orgId ?? "")) throw new Error("Unknown workspace");
    const code = (data?.code ?? "").trim();
    if (code.length < 3 || code.length > 40) throw new Error("That referral code is not valid");
    return { orgId: data.orgId, code };
  })
  .handler(async ({ data, context }) => {
    const { data: partnerId, error } = await context.supabase.rpc("attach_referral", {
      _org_id: data.orgId,
      _code: data.code,
    });
    if (error) throw new Error(error.message);
    return { partnerId: partnerId as string };
  });

/** What a workspace already knows about its own referral. */
export const getWorkspaceReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orgId: string }) => {
    if (!UUID.test(data?.orgId ?? "")) throw new Error("Unknown workspace");
    return { orgId: data.orgId };
  })
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("organizations")
      .select("referred_by_partner_id, referred_at")
      .eq("id", data.orgId)
      .maybeSingle();
    if (error) throw error;
    return {
      attached: Boolean(row?.referred_by_partner_id),
      referredAt: row?.referred_at ?? null,
    };
  });

/**
 * Platform-admin only, and the database says so — this call carries no proof
 * of its own. Every override writes an audit row with the actor, the tier the
 * ledger had actually earned, and the reason.
 */
export const setPartnerTier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { partnerId: string; tier: number | null; reason: string }) => {
    if (!UUID.test(data?.partnerId ?? "")) throw new Error("Partner not found");
    const tier = data?.tier ?? null;
    if (tier !== null && (!Number.isInteger(tier) || tier < 0 || tier > 4)) {
      throw new Error("That tier does not exist");
    }
    const reason = (data?.reason ?? "").trim();
    if (!reason) throw new Error("A tier override needs a reason");
    return { partnerId: data.partnerId, tier, reason: reason.slice(0, 300) };
  })
  .handler(async ({ data, context }) => {
    const { data: tier, error } = await context.supabase.rpc("set_partner_tier_override", {
      _partner_id: data.partnerId,
      // null clears the override and hands the tier back to the ledger; the
      // generated signature types the argument as non-null, the function does not.
      _tier: data.tier as unknown as number,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { effectiveTier: Number(tier) };
  });
