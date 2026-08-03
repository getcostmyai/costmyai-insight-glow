import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Banknote, Loader2 } from "lucide-react";

import { listPayoutQueue, runPayouts } from "@/lib/partners.functions";
import { getStripeEnvironment } from "@/lib/stripe";

export const Route = createFileRoute("/_authenticated/admin/payouts")({
  head: () => ({
    meta: [
      { title: "Partner payouts — review and run" },
      { name: "description", content: "Internal payout run for partner commission." },
      { property: "og:title", content: "Partner payouts" },
      { property: "og:description", content: "Internal payout run." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PayoutsPage,
});

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

type Outcome = Awaited<ReturnType<typeof runPayouts>>[number];

const SKIP_COPY: Record<string, string> = {
  payout_account_not_ready: "Payout account not verified — lines stay unpaid",
  partner_not_active: "Partner account is not active",
  nothing_owed: "Nothing owed",
  negative_balance: "Clawbacks exceed what is owed — nets against the next run",
  below_minimum: "Under the $50 minimum — carries forward to the next run",
  unknown_partner: "Partner not found",
};

function PayoutsPage() {
  const queue = useServerFn(listPayoutQueue);
  const run = useServerFn(runPayouts);
  const [results, setResults] = useState<Outcome[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const environment = (() => {
    try {
      return getStripeEnvironment();
    } catch {
      return null;
    }
  })();

  const {
    data,
    isLoading,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: ["payout-queue", environment],
    queryFn: () => queue({ data: { environment: environment! } }),
    enabled: environment !== null,
    retry: false,
  });

  if (isLoading) {
    return (
      <Shell>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </Shell>
    );
  }

  // A non-admin sees nothing, not a hint that the queue exists.
  if (queryError) {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground">Nothing here.</p>
      </Shell>
    );
  }

  const rows = data ?? [];
  const payable = rows.filter((r) => r.payable);
  const total = payable.reduce((sum, r) => sum + r.amountUsd, 0);

  async function pay(partnerIds: string[]) {
    if (!environment || partnerIds.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      setResults(await run({ data: { partnerIds, environment } }));
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The payout run failed to start.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <div className="flex items-center gap-2">
        <Banknote className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight">Partner payouts</h1>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        <span className="tabular-nums">{usd(total)}</span> payable across{" "}
        <span className="tabular-nums">{payable.length}</span> of{" "}
        <span className="tabular-nums">{rows.length}</span> partners with outstanding commission
        {environment ? ` · ${environment}` : ""}.
      </p>

      {rows.length === 0 ? (
        <p className="mt-10 text-sm text-muted-foreground">Nothing outstanding.</p>
      ) : (
        <>
          <div className="mt-8 space-y-2">
            {rows.map((r) => (
              <div
                key={r.partnerId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium">{r.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.lineCount} line{r.lineCount === 1 ? "" : "s"} ·{" "}
                    {r.payable ? (
                      <span className="text-emerald-400">payout account verified</span>
                    ) : (
                      <span className="text-amber-400">
                        payout account {r.connectStatus.replace("_", " ")} — lines stay unpaid
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold tabular-nums">{usd(r.amountUsd)}</span>
                  <button
                    onClick={() => pay([r.partnerId])}
                    disabled={busy}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                  >
                    Pay this partner
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => pay(rows.map((r) => r.partnerId))}
            disabled={busy}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Run payout for everyone owed
          </button>
        </>
      )}

      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

      {results ? (
        <section className="mt-8 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-sm font-semibold">Last run</h2>
          <div className="mt-3 space-y-2 text-xs">
            {results.map((r) => (
              <div
                key={r.partnerId}
                className="border-t border-border pt-2 first:border-0 first:pt-0"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{r.partnerName || r.partnerId}</span>
                  {r.ok ? (
                    <>
                      <span className="tabular-nums text-emerald-400">
                        {r.amountPaid !== undefined && r.currency
                          ? `${r.amountPaid.toLocaleString("en-US", { style: "currency", currency: r.currency.toUpperCase() })}`
                          : usd(r.amountUsd ?? 0)}
                      </span>
                      <code className="font-mono text-[11px] text-muted-foreground">
                        {r.transferId}
                      </code>
                    </>
                  ) : (
                    <span className="text-amber-400">
                      {SKIP_COPY[r.reason ?? ""] ?? r.reason ?? "skipped"}
                    </span>
                  )}
                </div>
                {r.ok && r.fxRate ? (
                  <p className="mt-1 tabular-nums text-muted-foreground">
                    {usd(r.amountUsd ?? 0)} at{" "}
                    {r.fxRateIsWeighted
                      ? `a blended ${r.fxRate} across several booked rates`
                      : `the provider's booked rate ${r.fxRate}`}
                  </p>
                ) : null}
              </div>
            ))}
          </div>

        </section>
      ) : null}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-background px-6 py-12">
      <div className="mx-auto w-full max-w-3xl">{children}</div>
    </main>
  );
}
