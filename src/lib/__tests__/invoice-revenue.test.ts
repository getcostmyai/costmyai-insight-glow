/**
 * Commission is owed on revenue, not on the tax the provider collects on our
 * behalf and remits to a tax authority, and not on a number whose currency we
 * failed to look at.
 */
import { describe, expect, it } from "vitest";

import { invoiceRevenue, minorToMajor } from "@/lib/billing/invoice-revenue";

describe("commission basis from an invoice", () => {
  it("excludes collected tax from the basis", () => {
    // $100 price + $20 VAT, all collected.
    const r = invoiceRevenue({
      currency: "usd",
      amount_paid: 12000,
      total: 12000,
      total_taxes: [{ amount: 2000 }],
    });
    expect(r.amount).toBe(100);
    expect(r.taxAmount).toBe(20);
    expect(r.grossAmount).toBe(120);
  });

  it("falls back to the legacy scalar tax field", () => {
    const r = invoiceRevenue({ currency: "usd", amount_paid: 11000, total: 11000, tax: 1000 });
    expect(r.amount).toBe(100);
  });

  it("derives tax from the excluding-tax total when neither is present", () => {
    const r = invoiceRevenue({
      currency: "usd",
      amount_paid: 11000,
      total: 11000,
      total_excluding_tax: 10000,
    });
    expect(r.amount).toBe(100);
  });

  it("is the full amount when no tax was collected", () => {
    const r = invoiceRevenue({ currency: "usd", amount_paid: 4900, total: 4900 });
    expect(r.amount).toBe(49);
    expect(r.taxAmount).toBe(0);
  });

  it("takes only the collected share of a partly-paid invoice", () => {
    const r = invoiceRevenue({
      currency: "usd",
      amount_paid: 6000,
      total: 12000,
      total_taxes: [{ amount: 2000 }],
    });
    expect(r.amount).toBe(50);
    expect(r.taxAmount).toBe(10);
  });

  it("reads a zero-decimal currency in whole units, not cents", () => {
    const r = invoiceRevenue({ currency: "jpy", amount_paid: 12000, total: 12000 });
    expect(r.amount).toBe(12000);
    expect(minorToMajor(12000, "jpy")).toBe(12000);
    expect(minorToMajor(12000, "eur")).toBe(120);
    expect(minorToMajor(12000, "kwd")).toBe(12);
  });

  it("keeps the invoice's own currency rather than assuming dollars", () => {
    const r = invoiceRevenue({
      currency: "eur",
      amount_paid: 11900,
      total: 11900,
      total_taxes: [{ amount: 1900 }],
    });
    expect(r.currency).toBe("eur");
    expect(r.amount).toBe(100); // 100 EUR, not 100 USD — conversion is a separate step.
  });
});
