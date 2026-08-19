/**
 * The basis a partner's commission is paid on.
 *
 * Two things were wrong with `amount_paid / 100`:
 *
 *  1. Under managed payments the provider collects sales tax / VAT on top of
 *     the price and remits it to a tax authority. That money is never ours, so
 *     paying commission on it pays a partner out of the tax line.
 *  2. Managed payments presents in the buyer's local currency. `amount_paid`
 *     is in the invoice's own currency and its own minor unit — a ¥12,000
 *     invoice is 12000, not 120.00, and it is not dollars either way.
 *
 * This module isolates the pre-tax portion of what was actually collected, in
 * the invoice's own currency and major unit. Converting that to USD, when the
 * invoice is not already USD, is a separate step that needs a real provider
 * rate (see `invoice-revenue.server.ts`).
 */

/** Currencies the provider quotes in whole units — no cents. */
const ZERO_DECIMAL = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga",
  "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);
/** Currencies with three minor digits — 1/1000, not 1/100. */
const THREE_DECIMAL = new Set(["bhd", "jod", "kwd", "omr", "tnd"]);

export function minorToMajor(amount: number, currency: string): number {
  const c = currency.toLowerCase();
  if (ZERO_DECIMAL.has(c)) return amount;
  if (THREE_DECIMAL.has(c)) return amount / 1000;
  return amount / 100;
}

export interface InvoiceLike {
  currency?: string | null;
  amount_paid?: number | null;
  total?: number | null;
  /** Current API: one entry per applied tax. */
  total_taxes?: Array<{ amount?: number | null }> | null;
  /** Older payloads carried a single scalar. */
  tax?: number | null;
  total_excluding_tax?: number | null;
}

export interface InvoiceRevenue {
  currency: string;
  /** Pre-tax revenue actually collected, in the invoice's own currency. */
  amount: number;
  /** Tax the provider collected and will remit — never commissionable. */
  taxAmount: number;
  /** Gross collected, for reconciliation against the provider's dashboard. */
  grossAmount: number;
}

/** Tax collected on the invoice, in minor units. */
function taxMinor(invoice: InvoiceLike): number {
  const list = invoice.total_taxes;
  if (Array.isArray(list) && list.length > 0) {
    return list.reduce((sum, t) => sum + Number(t?.amount ?? 0), 0);
  }
  if (typeof invoice.tax === "number") return invoice.tax;
  if (typeof invoice.total === "number" && typeof invoice.total_excluding_tax === "number") {
    return Math.max(0, invoice.total - invoice.total_excluding_tax);
  }
  return 0;
}

/**
 * A partly-paid invoice is commissionable only on what actually cleared, so
 * the pre-tax share is taken proportionally rather than assuming the whole
 * price was collected.
 */
export function invoiceRevenue(invoice: InvoiceLike): InvoiceRevenue {
  const currency = (invoice.currency ?? "usd").toLowerCase();
  const paidMinor = Number(invoice.amount_paid ?? 0);
  const totalMinor = Number(invoice.total ?? 0);
  const tax = taxMinor(invoice);

  const preTaxMinor =
    totalMinor > 0 ? (paidMinor * Math.max(0, totalMinor - tax)) / totalMinor : paidMinor;
  const collectedTaxMinor = Math.max(0, paidMinor - preTaxMinor);

  const round = (n: number) => Math.round(minorToMajor(n, currency) * 100) / 100;

  return {
    currency,
    amount: round(preTaxMinor),
    taxAmount: round(collectedTaxMinor),
    grossAmount: round(paidMinor),
  };
}
