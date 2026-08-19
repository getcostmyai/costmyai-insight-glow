/**
 * Real test-mode drill for the commission basis and proportional clawback.
 * Creates a taxed invoice, pays it, refunds half, and runs the real code.
 */
import { createClient } from "@supabase/supabase-js";
import { createStripeClient } from "@/lib/stripe.server";
import { commissionBasisUsd } from "@/lib/billing/invoice-revenue.server";
import { invoiceRevenue } from "@/lib/billing/invoice-revenue";

const stripe = createStripeClient("sandbox");
const admin = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
  auth: { persistSession: false },
});

function refundedFraction(charge: any): number {
  const amount = Number(charge?.amount ?? 0);
  if (!(amount > 0)) return 1;
  return Math.min(1, Number(charge?.amount_refunded ?? 0) / amount);
}

async function paidInvoice(currency: string, unitAmount: number, taxPct: number | null) {
  const customer = await stripe.customers.create({
    email: `drill-${Date.now()}@costmyai-test.dev`,
    payment_method: "pm_card_visa",
    invoice_settings: { default_payment_method: "pm_card_visa" },
    address: { country: "DE", line1: "Teststr 1", city: "Berlin", postal_code: "10115" },
  });
  let taxRateId: string | undefined;
  if (taxPct !== null) {
    const tr = await stripe.taxRates.create({
      display_name: "VAT",
      percentage: taxPct,
      inclusive: false,
      country: "DE",
    });
    taxRateId = tr.id;
  }
  await stripe.invoiceItems.create({
    customer: customer.id,
    amount: unitAmount,
    currency,
    description: "CostMyAI drill",
    ...(taxRateId ? { tax_rates: [taxRateId] } : {}),
  });
  let invoice = await stripe.invoices.create({ customer: customer.id, collection_method: "charge_automatically", pending_invoice_items_behavior: "include" } as any);
  invoice = await stripe.invoices.finalizeInvoice(invoice.id!);
  if (invoice.status !== "paid") invoice = await stripe.invoices.pay(invoice.id!);
  const full = (await stripe.invoices.retrieve(invoice.id!, {
    expand: ["payments.data.payment.charge"],
  })) as any;
  return { customer, invoice: full };
}

async function chargeOf(invoice: any) {
  const payment = invoice.payments?.data?.[0]?.payment;
  const ref = payment?.charge;
  if (typeof ref === "string") return stripe.charges.retrieve(ref);
  if (ref?.id) return stripe.charges.retrieve(ref.id);
  const pi = await stripe.paymentIntents.retrieve(payment.payment_intent, { expand: ["latest_charge"] });
  return typeof pi.latest_charge === "string"
    ? stripe.charges.retrieve(pi.latest_charge)
    : (pi.latest_charge as any);
}

async function main() {
  console.log("=== 1. USD invoice, $100 + 20% VAT ===");
  const { invoice } = await paidInvoice("usd", 10000, 20);
  console.log({
    id: invoice.id,
    currency: invoice.currency,
    subtotal: invoice.subtotal,
    total: invoice.total,
    amount_paid: invoice.amount_paid,
    tax_legacy: invoice.tax,
    total_taxes: invoice.total_taxes,
    total_excluding_tax: invoice.total_excluding_tax,
  });
  const pure = invoiceRevenue(invoice);
  console.log("invoiceRevenue:", pure);
  const basis = await commissionBasisUsd(stripe, invoice.id, invoice);
  console.log("commissionBasisUsd:", basis);
  console.log("old (buggy) basis amount_paid/100 =", invoice.amount_paid / 100);

  console.log("\n=== 2. Ledger: accrue on that basis, then refund half ===");
  const stamp = Date.now();
  const { data: userRes } = await admin.auth.admin.createUser({
    email: `drill-owner-${stamp}@costmyai-test.dev`,
    password: "Drill-Pass-2026!",
    email_confirm: true,
  });
  const uid = userRes!.user!.id;
  const { data: partner, error: pe } = await admin
    .from("partners")
    .insert({ name: `Drill Partner ${stamp}`, referral_code: `drill-${stamp}`, status: "active", created_by: uid })
    .select("id")
    .single();
  if (pe) throw pe;
  const { data: orgId, error: oe } = await admin.rpc("create_organization_for_owner" as any, {}).then(
    () => ({ data: null, error: null }) as any,
    () => ({ data: null, error: null }) as any,
  );
  void orgId; void oe;
  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({ name: `Drill Co ${stamp}`, slug: `drill-co-${stamp}`, referred_by_partner_id: partner.id })
    .select("id")
    .single();
  if (orgErr) throw orgErr;

  const ledgerId = await admin.rpc("accrue_commission", {
    _org_id: org.id,
    _invoice_id: invoice.id,
    _revenue_usd: basis.amountUsd,
    _environment: "sandbox",
  });
  console.log("accrued:", ledgerId.data, ledgerId.error?.message);
  const show = async (label: string) => {
    const { data } = await admin
      .from("commission_ledger")
      .select("invoice_id, revenue_usd, commission_usd, status, clawed_back_fraction, clawback_of")
      .eq("org_id", org.id)
      .order("created_at");
    console.log(label, data);
    const net = (data ?? []).filter((r: any) => r.status !== "clawed_back")
      .reduce((s: number, r: any) => s + Number(r.commission_usd), 0);
    console.log("  net payable commission:", Math.round(net * 100) / 100);
  };
  await show("ledger after accrual:");

  const charge = await chargeOf(invoice);
  const half = Math.round(charge.amount / 2);
  await stripe.refunds.create({ charge: charge.id, amount: half });
  const refunded = await stripe.charges.retrieve(charge.id);
  const frac = refundedFraction(refunded);
  console.log("charge amount", charge.amount, "refunded", refunded.amount_refunded, "fraction", frac);

  console.log(
    "clawback(partial):",
    (await admin.rpc("clawback_commission" as any, {
      _invoice_id: invoice.id,
      _reason: "partial refund drill",
      _environment: "sandbox",
      _fraction: frac,
    })).data,
  );
  await show("ledger after 50% refund:");

  console.log(
    "clawback(replay same fraction):",
    (await admin.rpc("clawback_commission" as any, {
      _invoice_id: invoice.id,
      _reason: "replay",
      _environment: "sandbox",
      _fraction: frac,
    })).data,
  );
  await show("ledger after replay:");

  // Refund the rest.
  await stripe.refunds.create({ charge: charge.id, amount: charge.amount - half });
  const full2 = await stripe.charges.retrieve(charge.id);
  const frac2 = refundedFraction(full2);
  console.log(
    "clawback(now full):",
    (await admin.rpc("clawback_commission" as any, {
      _invoice_id: invoice.id,
      _reason: "fully refunded",
      _environment: "sandbox",
      _fraction: frac2,
    })).data,
  );
  await show("ledger after full refund:");

  console.log("\n=== 3. Non-USD invoice (EUR) ===");
  try {
    const eur = await paidInvoice("eur", 10000, 19);
    console.log({
      id: eur.invoice.id,
      currency: eur.invoice.currency,
      total: eur.invoice.total,
      amount_paid: eur.invoice.amount_paid,
      total_taxes: eur.invoice.total_taxes,
    });
    console.log("invoiceRevenue:", invoiceRevenue(eur.invoice));
    try {
      const b = await commissionBasisUsd(stripe, eur.invoice.id, eur.invoice);
      console.log("commissionBasisUsd:", b);
    } catch (e) {
      console.log("commissionBasisUsd refused:", (e as Error).message);
    }
    const c = await chargeOf(eur.invoice);
    const bt = await stripe.balanceTransactions.retrieve(c.balance_transaction as string);
    console.log("balance transaction:", { id: bt.id, currency: bt.currency, exchange_rate: bt.exchange_rate });
  } catch (e) {
    console.log("EUR drill unavailable:", (e as Error).message);
  }

  // Clean up fixtures.
  await admin.from("commission_ledger").delete().eq("org_id", org.id);
  await admin.from("organizations").delete().eq("id", org.id);
  await admin.from("partners").delete().eq("id", partner.id);
  await admin.auth.admin.deleteUser(uid);
  console.log("\nfixtures removed");
}

main().catch((e) => {
  console.error("DRILL FAILED:", e);
  process.exit(1);
});
