/**
 * Throwaway drill: proves the real USD -> EUR payout path end to end against
 * Stripe test mode. Deleted after the run.
 */
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

import { convertCommissionLines } from "../src/lib/partners/fx";
import { resolveLineRate } from "../src/lib/partners/fx.server";

const stripe = new Stripe(process.env["STRIPE_LIVE_TEST_API_KEY"]!, {
  apiVersion: "2026-03-25.dahlia",
});
const db = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
  auth: { persistSession: false },
});

const log = (...a: unknown[]) => console.log(...a);
const created: Record<string, string[]> = { accounts: [], charges: [], customers: [] };

async function main() {
  // 1. Fund the platform test balance with a real USD charge.
  const fund = await stripe.charges.create({
    amount: 100_000,
    currency: "usd",
    source: "tok_bypassPending",
    description: "FX drill funding",
  });
  created.charges.push(fund.id);
  log("funding charge:", fund.id, fund.currency, fund.amount);

  // 2. A real customer invoice in USD — this is what commission accrues off.
  const customer = await stripe.customers.create({ email: `fx-drill-${Date.now()}@example.com` });
  created.customers.push(customer.id);
  const pm = await stripe.paymentMethods.create({ type: "card", card: { token: "tok_visa" } });
  await stripe.paymentMethods.attach(pm.id, { customer: customer.id });
  await stripe.customers.update(customer.id, {
    invoice_settings: { default_payment_method: pm.id },
  });
  let invoice = await stripe.invoices.create({ customer: customer.id, auto_advance: false });
  await stripe.invoiceItems.create({
    customer: customer.id,
    invoice: invoice.id!,
    amount: 49_900,
    currency: "usd",
    description: "CostMyAI Rightsize (FX drill)",
  });
  invoice = await stripe.invoices.finalizeInvoice(invoice.id!);
  if (invoice.status !== "paid") invoice = await stripe.invoices.pay(invoice.id!);
  log("invoice paid:", invoice.id, invoice.amount_paid, invoice.currency);

  // 3. A connected account that can receive transfers.
  const account = await stripe.accounts.create({
    type: "custom",
    country: "DE",
    email: "fx-drill-partner@example.com",
    capabilities: { transfers: { requested: true } },
    business_type: "individual",
    individual: {
      first_name: "Fx",
      last_name: "Drill",
      email: "fx-drill-partner@example.com",
      dob: { day: 1, month: 1, year: 1980 },
      address: { line1: "Musterstr 1", city: "Berlin", postal_code: "10115", country: "DE" },
    },
    business_profile: { url: "https://costmyai.com", mcc: "7372" },
    tos_acceptance: { date: Math.floor(Date.now() / 1000), ip: "8.8.8.8" },
    external_account: {
      object: "bank_account",
      country: "DE",
      currency: "eur",
      account_number: "DE89370400440532013000",
    } as never,
  });
  created.accounts.push(account.id);
  log("connected account:", account.id, "payouts_enabled:", account.payouts_enabled);

  // 4. Ledger fixtures: org + partner + a pending commission line on that invoice.
  const suffix = Date.now();
  const { data: partner, error: pErr } = await db
    .from("partners")
    .insert({
      name: `FX Drill Partner ${suffix}`,
      referral_code: `fxdrill${suffix}`,
      status: "active",
      contact_email: "fx-drill-partner@example.com",
      stripe_connect_account_id: account.id,
      stripe_connect_status: "active",
      stripe_connect_environment: "sandbox",
    })
    .select("id")
    .single();
  if (pErr) throw pErr;

  const { data: org, error: oErr } = await db
    .from("organizations")
    .insert({
      name: `FX Drill Org ${suffix}`,
      slug: `fx-drill-${suffix}`,
      plan: "rightsize",
      is_synthetic: false,
      referred_by_partner_id: partner.id,
      referred_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (oErr) throw oErr;

  const revenueUsd = invoice.amount_paid / 100;
  const { error: lErr } = await db.from("commission_ledger").insert({
    partner_id: partner.id,
    org_id: org.id,
    invoice_id: invoice.id!,
    revenue_usd: revenueUsd,
    rate_pct: 15,
    commission_usd: Math.round(revenueUsd * 0.15 * 100) / 100,
    status: "pending",
    environment: "sandbox",
  });
  if (lErr) throw lErr;
  log("commission line:", revenueUsd, "USD revenue ->", Math.round(revenueUsd * 15) / 100, "USD");

  // 5. Reserve the lines exactly as production does.
  const { data: claim, error: bErr } = await db.rpc("payout_begin", {
    _partner_id: partner.id,
    _environment: "sandbox",
    _actor: null,
  });
  if (bErr) throw bErr;
  log("payout_begin:", claim);
  const c = claim as any;
  if (!c.ok) throw new Error(`payout_begin refused: ${c.reason}`);

  // 6. Real rate, from the provider's own balance transaction.
  const { data: lines } = await db
    .from("commission_ledger")
    .select("invoice_id, commission_usd")
    .eq("payout_id", c.payout_id);
  const resolved = [];
  for (const l of lines ?? []) {
    resolved.push(await resolveLineRate(stripe, l.invoice_id, Number(l.commission_usd)));
  }
  log("resolved rates:", JSON.stringify(resolved, null, 2));
  const conversion = convertCommissionLines(resolved, "eur");
  log("conversion:", JSON.stringify(conversion, null, 2));

  const { error: fxErr } = await db.rpc("payout_record_fx", {
    _payout_id: c.payout_id,
    _currency: conversion.currency,
    _rate: conversion.weightedRate,
    _amount: conversion.amountConverted,
    _detail: conversion.breakdown as never,
  });
  if (fxErr) throw fxErr;

  // 7. The transfer itself, in EUR.
  const transfer = await stripe.transfers.create(
    {
      amount: Math.round(conversion.amountConverted * 100),
      currency: conversion.currency,
      destination: account.id,
      description: `FX drill (${conversion.amountUsd} USD at ${conversion.weightedRate})`,
      metadata: { payoutId: c.payout_id },
    },
    { idempotencyKey: `partner-payout-${c.payout_id}` },
  );
  log("TRANSFER:", transfer.id, transfer.amount, transfer.currency);

  const { error: sErr } = await db.rpc("payout_settle", {
    _payout_id: c.payout_id,
    _transfer_id: transfer.id,
  });
  if (sErr) throw sErr;

  const { data: row } = await db
    .from("partner_payouts")
    .select("*")
    .eq("id", c.payout_id)
    .single();
  log("PAYOUT ROW:", JSON.stringify(row, null, 2));

  const { data: ledger } = await db
    .from("commission_ledger")
    .select("invoice_id, commission_usd, status, stripe_transfer_id")
    .eq("payout_id", c.payout_id);
  log("LEDGER:", JSON.stringify(ledger, null, 2));

  console.log("CLEANUP_IDS", JSON.stringify({ ...created, partner: partner.id, org: org.id, payout: c.payout_id, invoice: invoice.id }));
}

main().catch((e) => {
  console.error("DRILL FAILED:", e?.raw?.message ?? e?.message ?? e);
  process.exit(1);
});
