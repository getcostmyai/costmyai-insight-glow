import { createFileRoute } from "@tanstack/react-router";
import { TrendingUp } from "lucide-react";

import { usePartnerData } from "@/components/partner/partner-context";
import { PayoutAccountCard } from "@/components/partner/PayoutAccountCard";
import { usd } from "@/routes/_authenticated/partner";

export const Route = createFileRoute("/_authenticated/partner/earnings")({
  head: () => ({
    meta: [
      { title: "Partner earnings — CostMyAI" },
      {
        name: "description",
        content:
          "Your payout account, the commission ledger and every payout made, one line per paid invoice and never an estimate.",
      },
      { property: "og:title", content: "Partner earnings — CostMyAI" },
      {
        property: "og:description",
        content: "Payout account, commission ledger and payout history.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PartnerEarnings,
});

function PartnerEarnings() {
  const { partner, commissions, payouts, totals } = usePartnerData();

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Earnings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Where your money is paid, what has been earned, and what has already left our account.
      </p>

      <PayoutAccountCard
        partner={partner}
        payouts={payouts}
        outstandingUsd={totals.outstandingUsd}
      />

      <section className="mt-6 rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Commission ledger</h2>
        </div>
        {commissions.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Entries appear here when a referred workspace pays an invoice — one line per invoice,
            never estimated.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4 font-medium">Period</th>
                  <th className="py-2 pr-4 font-medium">Revenue</th>
                  <th className="py-2 pr-4 font-medium">Rate</th>
                  <th className="py-2 pr-4 font-medium">Commission</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {commissions.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="py-2 pr-4 tabular-nums text-muted-foreground">
                      {c.periodStart ? new Date(c.periodStart).toLocaleDateString() : "—"}
                    </td>
                    <td className="py-2 pr-4 tabular-nums">{usd(c.revenueUsd)}</td>
                    <td className="py-2 pr-4 tabular-nums text-muted-foreground">{c.ratePct}%</td>
                    <td className="py-2 pr-4 font-semibold tabular-nums text-emerald-400">
                      {usd(c.commissionUsd)}
                    </td>
                    <td className="py-2 text-xs capitalize text-muted-foreground">
                      {c.status.replace("_", " ")}
                      {c.transferId ? (
                        <span className="ml-2 font-mono text-[11px] normal-case">
                          {c.transferId}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
