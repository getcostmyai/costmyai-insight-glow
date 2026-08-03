import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Split } from "lucide-react";

import { readReferralSplit } from "@/lib/partners.functions";

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
