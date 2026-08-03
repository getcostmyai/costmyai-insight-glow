/**
 * Commission is earned in USD; the payout account settles in EUR. These tests
 * pin the one rule that decides whether a partner is paid correctly: the rate
 * must be the provider's own booked rate, and a missing rate must refuse
 * rather than fall back to an estimate.
 */
import { describe, expect, it } from "vitest";

import {
  convertCommissionLines,
  FxRateUnavailableError,
  type CommissionFxLine,
} from "@/lib/partners/fx";

const line = (over: Partial<CommissionFxLine> = {}): CommissionFxLine => ({
  invoiceId: "in_1",
  commissionUsd: 100,
  balanceTransactionId: "txn_1",
  exchangeRate: 0.86,
  settlementCurrency: "eur",
  ...over,
});

describe("payout FX conversion", () => {
  it("converts a single line at the provider's booked rate", () => {
    const out = convertCommissionLines([line()], "eur");
    expect(out.amountUsd).toBe(100);
    expect(out.amountConverted).toBe(86);
    expect(out.rate).toBe(0.86);
    expect(out.rateIsWeighted).toBe(false);
    expect(out.breakdown[0]).toMatchObject({
      invoiceId: "in_1",
      balanceTransactionId: "txn_1",
      exchangeRate: 0.86,
      convertedAmount: 86,
    });
  });

  it("reports one shared rate verbatim, without cent-rounding drift", () => {
    // The real drill case: 74.85 * 0.867525 = 64.934…, transferable as 64.93.
    // Dividing back would give 0.867468, which reads like a second rate.
    const out = convertCommissionLines(
      [
        line({ invoiceId: "in_1", commissionUsd: 40, exchangeRate: 0.867525, balanceTransactionId: "txn_a" }),
        line({ invoiceId: "in_2", commissionUsd: 34.85, exchangeRate: 0.867525, balanceTransactionId: "txn_b" }),
      ],
      "eur",
    );
    expect(out.rate).toBe(0.867525);
    expect(out.rateIsWeighted).toBe(false);
    expect(out.amountConverted).toBe(64.93);
  });



  it("weights each line by its own real rate rather than averaging", () => {
    const out = convertCommissionLines(
      [
        line({ invoiceId: "in_1", commissionUsd: 100, exchangeRate: 0.9, balanceTransactionId: "txn_a" }),
        line({ invoiceId: "in_2", commissionUsd: 300, exchangeRate: 0.8, balanceTransactionId: "txn_b" }),
      ],
      "eur",
    );
    // 100*0.9 + 300*0.8 = 330, not 400 * mean(0.85) = 340.
    expect(out.amountConverted).toBe(330);
    expect(out.rate).toBe(0.825);
    expect(out.rateIsWeighted).toBe(true);
    expect(out.breakdown).toHaveLength(2);
  });

  it("nets a clawback offset down at its own line rate", () => {
    const out = convertCommissionLines(
      [
        line({ invoiceId: "in_1", commissionUsd: 200, exchangeRate: 0.9, balanceTransactionId: "txn_a" }),
        line({
          invoiceId: "in_1:clawback",
          commissionUsd: -50,
          exchangeRate: 0.9,
          balanceTransactionId: "txn_a",
        }),
      ],
      "eur",
    );
    expect(out.amountUsd).toBe(150);
    expect(out.amountConverted).toBe(135);
  });

  it("refuses, with the reason, when a rate is missing", () => {
    expect(() =>
      convertCommissionLines(
        [
          line({ invoiceId: "in_ok" }),
          line({
            invoiceId: "in_bad",
            exchangeRate: null,
            balanceTransactionId: "txn_z",
            unavailableReason: "balance transaction txn_z carries no exchange rate",
          }),
        ],
        "eur",
      ),
    ).toThrowError(/in_bad: balance transaction txn_z carries no exchange rate/);
  });

  it("never falls back to an estimate — it throws a typed refusal", () => {
    try {
      convertCommissionLines([line({ exchangeRate: null, balanceTransactionId: null })], "eur");
      throw new Error("should have refused");
    } catch (error) {
      expect(error).toBeInstanceOf(FxRateUnavailableError);
      expect((error as FxRateUnavailableError).invoiceIds).toEqual(["in_1"]);
    }
  });

  it("refuses when the charge settled in a different currency than the payout", () => {
    expect(() => convertCommissionLines([line({ settlementCurrency: "gbp" })], "eur")).toThrowError(
      /settled in gbp, not eur/,
    );
  });

  it("refuses a payout with no lines and one that nets to zero", () => {
    expect(() => convertCommissionLines([], "eur")).toThrow(FxRateUnavailableError);
    expect(() =>
      convertCommissionLines(
        [line({ commissionUsd: 100 }), line({ invoiceId: "in_2", commissionUsd: -100 })],
        "eur",
      ),
    ).toThrowError(/Nothing payable after conversion/);
  });
});
