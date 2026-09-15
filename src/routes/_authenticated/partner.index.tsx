import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Filter, Handshake } from "lucide-react";

import { usePartnerData } from "@/components/partner/partner-context";
import { Kpi, ReferralCode, usd } from "@/routes/_authenticated/partner";
import type { PartnerDashboard } from "@/lib/partners.functions";
import { getMyFunnel } from "@/lib/partner-funnel.functions";
import {
  FUNNEL_WINDOWS,
  stageLabel,
  type FunnelStageRow,
  type FunnelWindow,
} from "@/lib/partner-funnel";
import { SHOW_PARTNER_REFERRAL_FUNNEL } from "@/lib/partner-panels";

export const Route = createFileRoute("/_authenticated/partner/")({
  head: () => ({
    meta: [
      { title: "Partner overview — CostMyAI" },
      {
        name: "description",
        content:
          "Your referral code, the workspaces you've referred and your commission tier, measured from paid invoices rather than estimates.",
      },
      { property: "og:title", content: "Partner overview — CostMyAI" },
      {
        property: "og:description",
        content: "Your referral code, referred workspaces and tier progress.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PartnerOverview,
});

function PartnerOverview() {
  const { partner, referrals, totals } = usePartnerData();
  const paying = referrals.filter((r) => r.plan !== "compare").length;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-primary">
            <Handshake className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-widest">Partner</span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{partner.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {partner.status === "active"
              ? "Active — your code attributes new workspaces for their lifetime."
              : partner.status === "pending"
                ? "Pending approval — your code starts attributing once we activate it."
                : "Suspended — your code no longer attributes new workspaces."}
          </p>
        </div>
        <ReferralCode code={partner.referralCode} />
      </div>

      <section className="mt-8 grid gap-3 sm:grid-cols-4">
        <Kpi label="Commission rate" value={`${partner.ratePct}%`} tone="text-primary" />
        <Kpi label="Earned lifetime" value={usd(totals.earnedUsd)} tone="text-emerald-400" />
        <Kpi label="Outstanding" value={usd(totals.outstandingUsd)} tone="text-cyan-400" />
        <Kpi
          label="Referred workspaces"
          value={String(referrals.length)}
          sub={`${paying} on a paid level`}
        />
      </section>

      <TierProgress partner={partner} />

      <section className="mt-8 rounded-2xl border border-border bg-card p-6">
        <h2 className="text-sm font-semibold">Referred workspaces</h2>
        {referrals.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No referrals yet. Share your code — a workspace attaches it once, and it stays yours for
            the lifetime of that account.
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {referrals.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-4 py-3"
              >
                <p className="text-sm font-medium">{r.name}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="rounded-full bg-muted px-2 py-0.5 capitalize">{r.plan}</span>
                  <span className="tabular-nums">
                    {r.referredAt ? new Date(r.referredAt).toLocaleDateString() : "—"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          You see that a workspace is yours and which level it is on — never its spend, usage or
          people.
        </p>
      </section>

      {SHOW_PARTNER_REFERRAL_FUNNEL ? <ReferralFunnel /> : null}
    </div>
  );
}

/**
 * Referral funnel, one row per stage, in the same card/table language as the
 * commission ledger. Counts are distinct visitors; the rate is measured
 * against the previous stage, and is blank for the first stage and wherever
 * the previous stage was zero — never rendered as 0%.
 */
function ReferralFunnel() {
  const [windowDays, setWindowDays] = useState<FunnelWindow>(30);
  const funnel = useQuery({
    queryKey: ["my-funnel", windowDays],
    queryFn: () => getMyFunnel({ data: { windowDays } }),
  });

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Referral funnel</h2>
        </div>
        <div className="inline-flex items-center gap-1 rounded-full border border-border p-0.5">
          {FUNNEL_WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWindowDays(w)}
              aria-pressed={w === windowDays}
              className={`rounded-full px-2.5 py-1 text-xs tabular-nums transition-colors ${
                w === windowDays
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {w}d
            </button>
          ))}
        </div>
      </div>

      {funnel.isPending ? (
        <p className="mt-3 text-sm text-muted-foreground">Loading your funnel…</p>
      ) : funnel.isError ? (
        <p className="mt-3 text-sm text-muted-foreground">
          We could not read your funnel just now. Try again shortly.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-2 pr-4 font-medium">Stage</th>
                <th className="py-2 pr-4 font-medium">Visitors</th>
                <th className="py-2 font-medium">From previous</th>
              </tr>
            </thead>
            <tbody>
              {(funnel.data ?? []).map((r: FunnelStageRow) => (
                <tr key={r.stage} className="border-t border-border">
                  <td className="py-2 pr-4">{stageLabel(r.stage)}</td>
                  <td className="py-2 pr-4 font-semibold tabular-nums">{r.visitors}</td>
                  <td className="py-2 tabular-nums text-muted-foreground">
                    {r.ratePct === null ? "—" : `${r.ratePct}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        Distinct visitors attributed to your code in the last {windowDays} days. Zero is a real
        answer — nothing here is estimated or extrapolated.
      </p>
    </section>
  );
}

function TierProgress({ partner }: { partner: PartnerDashboard["partner"] }) {
  const { tiers, effectiveTier, earnedTier, lifetimeRevenueUsd, nextTier, toNextTierUsd } = partner;
  const span = nextTier
    ? nextTier.minLifetimeReferredUsd -
      (tiers.find((t) => t.tier === earnedTier)?.minLifetimeReferredUsd ?? 0)
    : 0;
  const done = nextTier
    ? Math.min(
        100,
        Math.max(
          0,
          ((lifetimeRevenueUsd -
            (tiers.find((t) => t.tier === earnedTier)?.minLifetimeReferredUsd ?? 0)) /
            (span || 1)) *
            100,
        ),
      )
    : 100;

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">
            {tiers.find((t) => t.tier === effectiveTier)?.name ?? "Associate"} tier
            {partner.overridden ? (
              <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
                assigned by CostMyAI
              </span>
            ) : null}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">
            {usd(lifetimeRevenueUsd)} of referred revenue counted
          </p>
        </div>
        {nextTier ? (
          <p className="text-xs text-muted-foreground tabular-nums">
            {usd(toNextTierUsd ?? 0)} to {nextTier.name} · {nextTier.ratePct}%
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Top tier reached</p>
        )}
      </div>

      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500"
          style={{ width: `${done}%` }}
        />
      </div>

      <div className="mt-4 grid grid-cols-5 gap-2">
        {tiers.map((t) => (
          <div
            key={t.tier}
            className={`rounded-xl border px-2 py-2 text-center ${
              t.tier === effectiveTier ? "border-primary bg-primary/10" : "border-border"
            }`}
          >
            <p className="text-[11px] text-muted-foreground">{t.name}</p>
            <p className="text-sm font-semibold tabular-nums">{t.ratePct}%</p>
            <p className="text-[11px] text-muted-foreground tabular-nums">
              {t.minLifetimeReferredUsd === 0
                ? "from $0"
                : `$${(t.minLifetimeReferredUsd / 1000).toFixed(0)}K`}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
