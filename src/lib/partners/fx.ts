/**
 * Commission is earned in USD, because that is what the customer was actually
 * charged. The payout account settles in EUR. Conversion therefore happens at
 * exactly one point — when money has to move — and it uses the rate the
 * payment provider itself already applied when it settled the underlying
 * charge into the EUR balance. Never a market lookup, never a daily average,
 * never a constant.
 *
 * If a line's real rate cannot be read back, the whole payout refuses. A
 * guessed rate would silently under- or over-pay a partner and leave nothing
 * to reconcile against.
 */

export interface CommissionFxLine {
  /** The commission ledger line's invoice id, as written by the webhook. */
  invoiceId: string;
  /** Signed: clawback offsets arrive negative and must net down the transfer. */
  commissionUsd: number;
  /** The provider's own balance transaction backing that invoice's charge. */
  balanceTransactionId: string | null;
  /** The rate the provider applied on that balance transaction. */
  exchangeRate: number | null;
  /** The currency that balance transaction actually settled in. */
  settlementCurrency: string | null;
  /** Why the rate is missing, when it is. */
  unavailableReason?: string;
}

export interface FxBreakdownEntry {
  invoiceId: string;
  balanceTransactionId: string;
  commissionUsd: number;
  exchangeRate: number;
  convertedAmount: number;
}

export interface FxConversion {
  currency: string;
  amountUsd: number;
  /**
   * The headline rate for the payout. When every line settled at the same
   * provider-booked rate this IS that exact rate, so the stored figure and the
   * per-line figure never disagree. Only when a run spans charges settled at
   * different rates does it become the blended effective rate of the payout as
   * actually paid — flagged by `rateIsWeighted`.
   */
  rate: number;
  /** True only when the lines carried more than one distinct real rate. */
  rateIsWeighted: boolean;
  amountConverted: number;
  breakdown: FxBreakdownEntry[];
}

/** Thrown instead of falling back to an estimate. */
export class FxRateUnavailableError extends Error {
  readonly invoiceIds: string[];
  constructor(message: string, invoiceIds: string[]) {
    super(message);
    this.name = "FxRateUnavailableError";
    this.invoiceIds = invoiceIds;
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round6 = (n: number) => Math.round(n * 1_000_000) / 1_000_000;

/**
 * Converts a payout's USD commission lines into the payout currency using each
 * line's own real rate, then sums. Lines with different rates stay separate in
 * the breakdown, so the arithmetic can be reconstructed line by line later.
 */
export function convertCommissionLines(
  lines: CommissionFxLine[],
  payoutCurrency: string,
): FxConversion {
  if (lines.length === 0) throw new FxRateUnavailableError("No commission lines to convert", []);

  const target = payoutCurrency.toLowerCase();
  const bad: string[] = [];
  const reasons: string[] = [];

  for (const line of lines) {
    if (!line.balanceTransactionId || line.exchangeRate === null || !(line.exchangeRate > 0)) {
      bad.push(line.invoiceId);
      reasons.push(
        `${line.invoiceId}: ${line.unavailableReason ?? "no exchange rate on the provider's balance transaction"}`,
      );
      continue;
    }
    if ((line.settlementCurrency ?? "").toLowerCase() !== target) {
      bad.push(line.invoiceId);
      reasons.push(
        `${line.invoiceId}: settled in ${line.settlementCurrency ?? "an unknown currency"}, not ${target}`,
      );
    }
  }

  if (bad.length > 0) {
    throw new FxRateUnavailableError(
      `The real exchange rate could not be read for ${bad.length} commission line(s): ${reasons.join("; ")}`,
      bad,
    );
  }

  const breakdown: FxBreakdownEntry[] = lines.map((line) => ({
    invoiceId: line.invoiceId,
    balanceTransactionId: line.balanceTransactionId!,
    commissionUsd: round2(line.commissionUsd),
    exchangeRate: line.exchangeRate!,
    convertedAmount: round2(line.commissionUsd * line.exchangeRate!),
  }));

  const amountUsd = round2(lines.reduce((sum, l) => sum + l.commissionUsd, 0));
  const amountConverted = round2(breakdown.reduce((sum, b) => sum + b.convertedAmount, 0));

  if (amountUsd <= 0 || amountConverted <= 0) {
    throw new FxRateUnavailableError(
      `Nothing payable after conversion (${amountUsd} USD → ${amountConverted} ${target})`,
      [],
    );
  }

  // One real rate across the run: report it verbatim. Dividing the
  // cent-rounded euro total back by the dollar total would otherwise produce a
  // near-identical but subtly different number, which looks like a second rate.
  const distinct = new Set(breakdown.map((b) => b.exchangeRate));
  const rateIsWeighted = distinct.size > 1;

  return {
    currency: target,
    amountUsd,
    rate: rateIsWeighted ? round6(amountConverted / amountUsd) : [...distinct][0]!,
    rateIsWeighted,
    amountConverted,
    breakdown,
  };
}
