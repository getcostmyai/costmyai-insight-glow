import type Stripe from "stripe";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createStripeClient, getStripeErrorMessage, type StripeEnv } from "@/lib/stripe.server";

/**
 * Partner payouts.
 *
 * Commission is computed after the fact from the ledger, so money moves as an
 * explicit transfer to the partner's own connected account, never as a split at
 * the moment a customer is charged. Two rules hold this together:
 *
 *  - the partner's bank and tax details never touch CostMyAI. Onboarding is the
 *    provider's own hosted flow, and the verification state we show is the one
 *    the provider reports back, not one we infer.
 *  - a payout run reserves the ledger lines it covers before any money moves,
 *    and settles them only on a completed transfer. A failed transfer releases
 *    the lines again; nothing is ever silently dropped or paid twice.
 */

export type ConnectStatus = "not_started" | "pending" | "active" | "restricted";

export function connectStatusFromAccount(account: Stripe.Account): ConnectStatus {
  const transfers = account.capabilities?.transfers;
  if (account.payouts_enabled && transfers === "active") return "active";
  const req = account.requirements;
  if (req?.disabled_reason || (req?.errors?.length ?? 0) > 0) return "restricted";
  if ((req?.past_due?.length ?? 0) > 0) return "restricted";
  return "pending";
}

interface PartnerRow {
  id: string;
  name: string;
  contact_email: string | null;
  status: string;
  stripe_connect_account_id: string | null;
  stripe_connect_status: string;
  stripe_connect_environment: string | null;
}

async function readPartner(partnerId: string): Promise<PartnerRow> {
  const { data, error } = await supabaseAdmin
    .from("partners")
    .select(
      "id, name, contact_email, status, stripe_connect_account_id, stripe_connect_status, stripe_connect_environment",
    )
    .eq("id", partnerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Partner not found");
  return data as PartnerRow;
}

/**
 * Creates the connected account if the partner has none, then hands back a
 * fresh hosted onboarding link. Account links are single use and short lived,
 * so this is called every time the partner clicks through.
 */
export async function startConnectOnboarding(
  partnerId: string,
  env: StripeEnv,
  returnUrl: string,
): Promise<{ url: string } | { error: string }> {
  const partner = await readPartner(partnerId);
  const stripe = createStripeClient(env);

  try {
    let accountId = partner.stripe_connect_account_id;

    // An account created in one environment is meaningless in the other.
    if (accountId && partner.stripe_connect_environment && partner.stripe_connect_environment !== env) {
      return {
        error: `This payout account belongs to the ${partner.stripe_connect_environment} environment.`,
      };
    }

    if (!accountId) {
      const created = await stripe.accounts.create({
        type: "express",
        ...(partner.contact_email ? { email: partner.contact_email } : {}),
        capabilities: { transfers: { requested: true } },
        business_profile: { product_description: "CostMyAI partner referral commission" },
        metadata: { partnerId },
      });
      accountId = created.id;
      const write = await supabaseAdmin.rpc("partner_set_connect_account", {
        _partner_id: partnerId,
        _account_id: accountId,
        _status: connectStatusFromAccount(created),
        _environment: env,
      });
      if (write.error) throw new Error(write.error.message);
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: returnUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });
    return { url: link.url };
  } catch (error) {
    return { error: getStripeErrorMessage(error) };
  }
}

/** Pulls the provider's current view of the account, for the impatient partner. */
export async function refreshConnectStatus(
  partnerId: string,
  env: StripeEnv,
): Promise<{ status: ConnectStatus } | { error: string }> {
  const partner = await readPartner(partnerId);
  if (!partner.stripe_connect_account_id) return { status: "not_started" };
  try {
    const stripe = createStripeClient(env);
    const account = await stripe.accounts.retrieve(partner.stripe_connect_account_id);
    const status = connectStatusFromAccount(account as Stripe.Account);
    const write = await supabaseAdmin.rpc("partner_set_connect_account", {
      _partner_id: partnerId,
      _account_id: partner.stripe_connect_account_id,
      _status: status,
      _environment: env,
    });
    if (write.error) throw new Error(write.error.message);
    return { status };
  } catch (error) {
    return { error: getStripeErrorMessage(error) };
  }
}

export interface PayoutOutcome {
  partnerId: string;
  partnerName: string;
  ok: boolean;
  /** Machine reason when `ok` is false: why this partner was skipped. */
  reason?: string;
  connectStatus?: string;
  amountUsd?: number;
  lineCount?: number;
  payoutId?: string;
  transferId?: string;
}

/**
 * One partner, one transfer. The ledger lines are reserved first, so a crash
 * between reserving and transferring leaves a visible pending run rather than
 * money owed twice. The payout id is the idempotency key, so a retried request
 * cannot create a second transfer for the same reserved lines.
 */
export async function runPayoutForPartner(
  partnerId: string,
  env: StripeEnv,
  actorUserId: string,
): Promise<PayoutOutcome> {
  const begun = await supabaseAdmin.rpc("payout_begin", {
    _partner_id: partnerId,
    _environment: env,
    _actor: actorUserId,
  });
  if (begun.error) throw new Error(begun.error.message);
  const claim = begun.data as {
    ok: boolean;
    reason?: string;
    connect_status?: string;
    partner_name?: string;
    payout_id?: string;
    amount_usd?: number;
    line_count?: number;
    destination?: string;
  };

  if (!claim.ok) {
    return {
      partnerId,
      partnerName: claim.partner_name ?? "",
      ok: false,
      reason: claim.reason ?? "unknown",
      ...(claim.connect_status ? { connectStatus: claim.connect_status } : {}),
    };
  }

  const amountUsd = Number(claim.amount_usd);
  const cents = Math.round(amountUsd * 100);

  try {
    const stripe = createStripeClient(env);
    const transfer = await stripe.transfers.create(
      {
        amount: cents,
        currency: "usd",
        destination: claim.destination!,
        description: `CostMyAI partner commission (${claim.line_count} invoice lines)`,
        metadata: { partnerId, payoutId: claim.payout_id!, environment: env },
      },
      { idempotencyKey: `partner-payout-${claim.payout_id}` },
    );

    const settle = await supabaseAdmin.rpc("payout_settle", {
      _payout_id: claim.payout_id!,
      _transfer_id: transfer.id,
    });
    if (settle.error) throw new Error(settle.error.message);

    return {
      partnerId,
      partnerName: claim.partner_name ?? "",
      ok: true,
      amountUsd,
      lineCount: Number(claim.line_count),
      payoutId: claim.payout_id!,
      transferId: transfer.id,
    };
  } catch (error) {
    const message = getStripeErrorMessage(error);
    await supabaseAdmin.rpc("payout_fail", {
      _payout_id: claim.payout_id!,
      _error: message,
    });
    return {
      partnerId,
      partnerName: claim.partner_name ?? "",
      ok: false,
      reason: `transfer_failed: ${message}`,
      amountUsd,
      lineCount: Number(claim.line_count),
      payoutId: claim.payout_id!,
    };
  }
}

/** Every partner with unpaid commission, whether or not they can be paid yet. */
export async function readPayoutQueue(env: StripeEnv) {
  const { data: rows, error } = await supabaseAdmin
    .from("commission_ledger")
    .select("partner_id, commission_usd, status, payout_id, environment")
    .eq("environment", env)
    .eq("status", "pending")
    .is("payout_id", null);
  if (error) throw new Error(error.message);

  const byPartner = new Map<string, { amountUsd: number; lineCount: number }>();
  for (const r of rows ?? []) {
    const agg = byPartner.get(r.partner_id) ?? { amountUsd: 0, lineCount: 0 };
    agg.amountUsd += Number(r.commission_usd);
    agg.lineCount += 1;
    byPartner.set(r.partner_id, agg);
  }
  if (byPartner.size === 0) return [];

  const { data: partners, error: pErr } = await supabaseAdmin
    .from("partners")
    .select("id, name, status, stripe_connect_status, stripe_connect_account_id")
    .in("id", [...byPartner.keys()]);
  if (pErr) throw new Error(pErr.message);

  return (partners ?? []).map((p) => {
    const agg = byPartner.get(p.id)!;
    return {
      partnerId: p.id,
      name: p.name,
      partnerStatus: p.status as string,
      connectStatus: p.stripe_connect_status as ConnectStatus,
      connected: Boolean(p.stripe_connect_account_id),
      amountUsd: Math.round(agg.amountUsd * 100) / 100,
      lineCount: agg.lineCount,
      payable: p.status === "active" && p.stripe_connect_status === "active" && agg.amountUsd > 0,
    };
  });
}
