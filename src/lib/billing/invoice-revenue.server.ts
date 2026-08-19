import type Stripe from "stripe";

import { retrieveInvoiceBalanceTransaction } from "@/lib/partners/fx.server";

import { invoiceRevenue, type InvoiceLike, type InvoiceRevenue } from "./invoice-revenue";

/** Thrown instead of silently treating foreign minor units as dollars. */
export class InvoiceCurrencyUnconvertibleError extends Error {
  readonly invoiceId: string;
  constructor(invoiceId: string, message: string) {
    super(message);
    this.name = "InvoiceCurrencyUnconvertibleError";
    this.invoiceId = invoiceId;
  }
}

export interface CommissionBasis extends InvoiceRevenue {
  /** Pre-tax revenue expressed in the ledger's currency, USD. */
  amountUsd: number;
  /** The provider's own rate used, when a conversion was needed. */
  exchangeRate: number | null;
  balanceTransactionId: string | null;
}

/**
 * The commission basis for an invoice: pre-tax, in USD.
 *
 * When the invoice is already USD nothing is converted. When it is not, the
 * rate comes from the provider's own balance transaction for that invoice's
 * charge — the same object the payout path reads (see
 * `retrieveInvoiceBalanceTransaction`). That is a real coupling, not a
 * coincidence: a balance transaction settles into the platform account's
 * single settlement currency, so this conversion only exists if that currency
 * is USD, and the payout path's EUR assumption only holds if it is EUR. They
 * cannot both be true. Rather than paper over it, each path refuses when the
 * settlement currency is not the one it needs, and says which it saw.
 */
export async function commissionBasisUsd(
  stripe: Stripe,
  invoiceId: string,
  invoice: InvoiceLike,
): Promise<CommissionBasis> {
  const revenue = invoiceRevenue(invoice);

  if (revenue.currency === "usd") {
    return { ...revenue, amountUsd: revenue.amount, exchangeRate: null, balanceTransactionId: null };
  }

  const { bt, reason } = await retrieveInvoiceBalanceTransaction(stripe, invoiceId);
  if (!bt) {
    throw new InvoiceCurrencyUnconvertibleError(
      invoiceId,
      `invoice is in ${revenue.currency} and no provider exchange rate is available: ${reason}`,
    );
  }
  if ((bt.currency ?? "").toLowerCase() !== "usd") {
    throw new InvoiceCurrencyUnconvertibleError(
      invoiceId,
      `invoice is in ${revenue.currency} but balance transaction ${bt.id} settled in ${bt.currency}, ` +
        `not usd — the ledger is USD-denominated and no real rate to USD exists on this object`,
    );
  }
  const rate = Number(bt.exchange_rate ?? 0);
  if (!(rate > 0)) {
    throw new InvoiceCurrencyUnconvertibleError(
      invoiceId,
      `balance transaction ${bt.id} carries no exchange rate for ${revenue.currency}`,
    );
  }

  return {
    ...revenue,
    amountUsd: Math.round(revenue.amount * rate * 100) / 100,
    exchangeRate: rate,
    balanceTransactionId: bt.id,
  };
}
