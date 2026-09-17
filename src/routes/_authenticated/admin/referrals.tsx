import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, RefreshCw, Split } from "lucide-react";

import { readReferralSplit } from "@/lib/partners.functions";
import { reissuePartnerCode } from "@/lib/partner-create.functions";

export const Route = createFileRoute("/_authenticated/admin/referrals")({
  head: () => ({
    meta: [
      { title: "Acquisition split — direct vs partner" },
      {
        name: "description",
        content: "Internal view of how many workspaces arrived direct and how many via a partner.",
      },
      { property: "og:title", content: "Acquisition split" },
      { property: "og:description", content: "Direct versus partner-referred workspaces." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReferralSplitPage,
});

function ReferralSplitPage() {
  const read = useServerFn(readReferralSplit);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-referral-split"],
    queryFn: () => read(),
  });

  const pct = data && data.total > 0 ? Math.round((data.partnerReferred / data.total) * 100) : 0;

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <div className="flex items-center gap-2">
        <Split className="h-4 w-4 text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight">Acquisition split</h1>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Every real workspace, counted once: arrived on its own, or arrived through a partner. The
        demo workspace is excluded.
      </p>

      {isLoading ? (
        <div className="mt-10 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading
        </div>
      ) : error ? (
        <p className="mt-10 text-sm text-destructive">
          {error instanceof Error ? error.message : "Could not load the split."}
        </p>
      ) : data ? (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <Stat label="Workspaces" value={data.total} />
            <Stat label="Direct" value={data.direct} />
            <Stat label="Partner-referred" value={data.partnerReferred} tone="text-primary" />
          </div>

          <div className="mt-6">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {pct}% of workspaces came through a partner.
            </p>
          </div>

          <h2 className="mt-12 text-sm font-semibold">By partner</h2>
          {data.byPartner.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No partner accounts yet.</p>
          ) : (
            <div className="mt-3 overflow-hidden rounded-2xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Partner</th>
                    <th className="px-4 py-3 font-medium">Code</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Referred</th>
                    <th className="px-4 py-3 text-right font-medium">Code</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byPartner.map((p) => (
                    <tr key={p.id} className="border-t border-border">
                      <td className="px-4 py-3 font-medium">{p.name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {p.code}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{p.status}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{p.referred}</td>
                      <td className="px-4 py-3 text-right">
                        <ReissueButton partnerId={p.id} name={p.name} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </main>
  );
}

function Stat({
  label,
  value,
  tone = "text-foreground",
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-2 text-3xl font-semibold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

/**
 * Reissue a partner's referral code.
 *
 * Retiring a code used to mean a founder-run database update. It is admin-only,
 * asks once before it acts because the old link stops resolving immediately,
 * and every reissue writes an audit row with the previous code and who did it.
 */
function ReissueButton({ partnerId, name }: { partnerId: string; name: string }) {
  const queryClient = useQueryClient();
  const reissue = useServerFn(reissuePartnerCode);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      await reissue({ data: { partnerId, reason: `Reissued from the admin referrals page` } });
      setConfirming(false);
      await queryClient.invalidateQueries({ queryKey: ["admin-referral-split"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reissue the code.");
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return <span className="text-xs text-destructive">{error}</span>;
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`Reissue the referral code for ${name}`}
        className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium transition-colors hover:bg-muted"
      >
        <RefreshCw className="h-3 w-3" /> Reissue
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Old link stops working.</span>
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-60"
      >
        {busy ? "…" : "Confirm"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-muted"
      >
        Cancel
      </button>
    </span>
  );
}
