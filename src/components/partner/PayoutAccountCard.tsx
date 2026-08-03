import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BadgeCheck, Banknote, Clock, Loader2 } from "lucide-react";

import { refreshPayoutAccount, startPayoutOnboarding } from "@/lib/partners.functions";
import type { PartnerDashboard, PayoutRun } from "@/lib/partners.functions";
import { getStripeEnvironment } from "@/lib/stripe";

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

const money = (n: number, currency: string) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: 2,
  });


const COPY: Record<
  PartnerDashboard["partner"]["payoutAccount"]["status"],
  { label: string; body: string; tone: string; Icon: typeof Banknote }
> = {
  not_started: {
    label: "Not connected",
    body: "Connect a payout account to receive your commission. You enter your bank and tax details with our payment provider, never with CostMyAI.",
    tone: "text-muted-foreground",
    Icon: Banknote,
  },
  pending: {
    label: "Pending verification",
    body: "Our payment provider is still verifying your account. Commission keeps accruing and is paid out as soon as verification completes.",
    tone: "text-amber-400",
    Icon: Clock,
  },
  active: {
    label: "Ready to receive payouts",
    body: "Verified. Your outstanding commission is transferred to this account on the next payout run.",
    tone: "text-emerald-400",
    Icon: BadgeCheck,
  },
  restricted: {
    label: "Action needed",
    body: "Our payment provider needs more information before it can pay you. Reopen onboarding to finish it — nothing is lost in the meantime.",
    tone: "text-red-400",
    Icon: AlertTriangle,
  },
};

export function PayoutAccountCard({
  partner,
  payouts,
  outstandingUsd,
}: {
  partner: PartnerDashboard["partner"];
  payouts: PayoutRun[];
  outstandingUsd: number;
}) {
  const [busy, setBusy] = useState<"connect" | "refresh" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const state = COPY[partner.payoutAccount.status];
  const { Icon } = state;

  const environment = (() => {
    try {
      return getStripeEnvironment();
    } catch {
      return null;
    }
  })();

  async function connect() {
    if (!environment) return setError("Payouts are not configured for this build yet.");
    setBusy("connect");
    setError(null);
    const result = await startPayoutOnboarding({
      data: { partnerId: partner.id, returnUrl: window.location.href, environment },
    });
    setBusy(null);
    if ("error" in result) return setError(result.error);
    window.location.href = result.url;
  }

  async function refresh() {
    if (!environment) return;
    setBusy("refresh");
    setError(null);
    const result = await refreshPayoutAccount({
      data: { partnerId: partner.id, environment },
    });
    setBusy(null);
    if ("error" in result) return setError(result.error);
    await queryClient.invalidateQueries({ queryKey: ["my-partner"] });
  }

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Icon className={`mt-0.5 h-4 w-4 ${state.tone}`} />
          <div>
            <h2 className="text-sm font-semibold">Payout account</h2>
            <p className={`mt-0.5 text-xs font-medium ${state.tone}`}>{state.label}</p>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">{state.body}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {partner.payoutAccount.connected && partner.payoutAccount.status !== "active" ? (
            <button
              onClick={refresh}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-60"
            >
              {busy === "refresh" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Check status
            </button>
          ) : null}
          {partner.payoutAccount.status !== "active" ? (
            <button
              onClick={connect}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {busy === "connect" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {partner.payoutAccount.connected ? "Continue onboarding" : "Connect payout account"}
            </button>
          ) : null}
        </div>
      </div>

      {error ? <p className="mt-3 text-xs text-red-400">{error}</p> : null}

      {partner.payoutAccount.status !== "active" && outstandingUsd > 0 ? (
        <p className="mt-4 rounded-xl border border-border px-4 py-3 text-xs text-muted-foreground">
          <span className="font-semibold tabular-nums text-foreground">{usd(outstandingUsd)}</span>{" "}
          is waiting for you. It stays on your ledger until your account is verified — it is never
          forfeited.
        </p>
      ) : null}

      {payouts.length > 0 ? (
        <div className="mt-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Payout history</p>
          <div className="mt-3 space-y-2">
            {payouts.map((p) => (
              <div
                key={p.id}
                className="rounded-xl border border-border px-4 py-3 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="tabular-nums text-muted-foreground">
                    {new Date(p.createdAt).toLocaleDateString()} · {p.lineCount} line
                    {p.lineCount === 1 ? "" : "s"}
                  </span>
                  <span className="font-semibold tabular-nums text-emerald-400">
                    {p.amountPaid !== null ? money(p.amountPaid, p.currency) : usd(p.amountUsd)}
                  </span>
                  <span
                    className={
                      p.status === "paid"
                        ? "text-emerald-400"
                        : p.status === "failed"
                          ? "text-red-400"
                          : "text-muted-foreground"
                    }
                  >
                    {p.status === "paid" ? "Paid" : p.status === "failed" ? "Failed" : "In progress"}
                  </span>
                  {p.transferId ? (
                    <code className="font-mono text-[11px] text-muted-foreground">
                      {p.transferId}
                    </code>
                  ) : null}
                </div>
                {p.fxRate !== null && p.amountPaid !== null ? (
                  <p className="mt-1.5 text-[11px] tabular-nums text-muted-foreground">
                    {usd(p.amountUsd)} commission converted at{" "}
                    {p.fxRateIsWeighted
                      ? `a blended ${p.fxRate} across several booked rates`
                      : `${p.fxRate} (the rate our payment provider actually applied)`}{" "}
                    → {money(p.amountPaid, p.currency)} paid
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

    </section>
  );
}
