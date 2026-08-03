import type Stripe from "stripe";

import type { CommissionFxLine } from "./fx";

/**
 * Reads the rate the provider actually used, from the balance transaction that
 * settled the invoice's charge into the platform's own balance. This is the
 * same object the provider reconciles against, so the number here is the one
 * that really moved money — not one we computed.
 */
export async function resolveLineRate(
  stripe: Stripe,
  invoiceId: string,
  commissionUsd: number,
): Promise<CommissionFxLine> {
  const miss = (reason: string): CommissionFxLine => ({
    invoiceId,
    commissionUsd,
    balanceTransactionId: null,
    exchangeRate: null,
    settlementCurrency: null,
    unavailableReason: reason,
  });

  // A clawback offset is written against `<invoice>:clawback`; it converts at
  // the rate of the invoice it reverses.
  const sourceInvoiceId = invoiceId.replace(/:clawback$/, "");

  let charge: Stripe.Charge | null = null;
  try {
    const invoice = (await stripe.invoices.retrieve(sourceInvoiceId, {
      expand: ["payments.data.payment.charge"],
    })) as Stripe.Invoice & { charge?: string | Stripe.Charge };

    const direct = invoice.charge;
    if (typeof direct === "string") {
      charge = await stripe.charges.retrieve(direct);
    } else if (direct && typeof direct === "object") {
      charge = direct;
    } else {
      const payment = (invoice as any).payments?.data?.[0]?.payment;
      const chargeRef = payment?.charge;
      if (typeof chargeRef === "string") charge = await stripe.charges.retrieve(chargeRef);
      else if (chargeRef && typeof chargeRef === "object") charge = chargeRef as Stripe.Charge;
      else if (typeof payment?.payment_intent === "string") {
        const intent = await stripe.paymentIntents.retrieve(payment.payment_intent, {
          expand: ["latest_charge"],
        });
        const latest = intent.latest_charge;
        charge = typeof latest === "string" ? await stripe.charges.retrieve(latest) : (latest ?? null);
      }
    }
  } catch (error) {
    return miss(`could not read the invoice (${(error as Error).message})`);
  }

  if (!charge) return miss("no settled charge found for this invoice");

  const btRef = charge.balance_transaction;
  if (!btRef) return miss("the charge has no balance transaction yet");

  let bt: Stripe.BalanceTransaction;
  try {
    bt = typeof btRef === "string" ? await stripe.balanceTransactions.retrieve(btRef) : btRef;
  } catch (error) {
    return miss(`could not read the balance transaction (${(error as Error).message})`);
  }

  const rate = bt.exchange_rate;
  if (rate === null || rate === undefined || !(Number(rate) > 0)) {
    return miss(`balance transaction ${bt.id} carries no exchange rate`);
  }

  return {
    invoiceId,
    commissionUsd,
    balanceTransactionId: bt.id,
    exchangeRate: Number(rate),
    settlementCurrency: bt.currency,
  };
}
