import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Copy, Handshake, TrendingUp } from "lucide-react";

import { getMyPartner, type PartnerDashboard } from "@/lib/partners.functions";
import { claimPartnerMembership } from "@/lib/partner-application.functions";

import { PayoutAccountCard } from "@/components/partner/PayoutAccountCard";
import { BrandKitCard } from "@/components/partner/BrandKitCard";
import { EarlyAccessCard } from "@/components/partner/EarlyAccessCard";

export const Route = createFileRoute("/_authenticated/partner")({
  head: () => ({
    meta: [
      { title: "Partner program — CostMyAI" },
      {
        name: "description",
        content:
          "Your referral code, the workspaces you've referred, your commission tier and every dollar earned — measured from paid invoices, not estimates.",
      },
      { property: "og:title", content: "Partner program — CostMyAI" },
      {
        property: "og:description",
        content: "Referrals, tier progress and lifetime commission on real paid invoices.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PartnerPage,
});

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

function PartnerPage() {
  const partner = useQuery({ queryKey: ["my-partner"], queryFn: () => getMyPartner() });
  const [claim, setClaim] = useState<"idle" | "running" | "done">("idle");
  // The self-link is attempted exactly once per mount. A ref, not effect
  // dependencies: `partner` is a new object every render, so depending on it
  // re-ran the effect, and its cleanup cancelled the in-flight attempt before
  // it could report back — a visitor who is not a partner sat on "Linking your
  // partner account…" forever instead of being told so.
  const claimed = useRef(false);

  // An approved applicant signs in for the first time with the email they
  // applied with: the account links itself here, once, instead of waiting on a
  // manual database insert.
  useEffect(() => {
    if (partner.isPending || partner.data || claimed.current) return;
    claimed.current = true;
    setClaim("running");
    void claimPartnerMembership()
      .then(async (r) => {
        if (r.partnerId) await partner.refetch();
      })
      .catch(() => undefined)
      .finally(() => setClaim("done"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partner.isPending, partner.data]);


  if (partner.isPending) return <Shell>Loading your partner account…</Shell>;
  if (partner.isError)
    return <Shell>We could not read your partner account. Try again shortly.</Shell>;
  // Never show "you aren't a partner" while the link is still being checked.
  if (!partner.data && claim !== "done") return <Shell>Linking your partner account…</Shell>;
  if (!partner.data) return <NotAPartner />;
  return <PartnerDashboardView data={partner.data} />;

}


function PartnerDashboardView({ data }: { data: PartnerDashboard }) {
  const { partner, referrals, commissions, payouts, totals } = data;
  const paying = referrals.filter((r) => r.plan !== "compare").length;

  return (
    <main className="min-h-screen bg-background px-6 py-12">
      <div className="mx-auto w-full max-w-4xl">
        <Link
          to="/workspace"
          className="mb-6 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to your workspace
        </Link>

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

        <PayoutAccountCard
          partner={partner}
          payouts={payouts}
          outstandingUsd={totals.outstandingUsd}
        />

        <BrandKitCard referralCode={partner.referralCode} active={partner.status === "active"} />

        <EarlyAccessCard />

        <TierProgress partner={partner} />

        <section className="mt-8 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-sm font-semibold">Referred workspaces</h2>
          {referrals.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No referrals yet. Share your code — a workspace attaches it once, and it stays yours
              for the lifetime of that account.
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
    </main>
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

function ReferralCode({ code }: { code: string }) {
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const [origin, setOrigin] = useState("https://costmyai.com");
  useEffect(() => setOrigin(window.location.origin), []);
  const link = `${origin}/r/${code}`;

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <code className="truncate rounded-lg border border-border bg-card px-3 py-2 font-mono text-sm">
        {link}
      </code>
      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(link);
            setCopied("link");
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
        >
          {copied === "link" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied === "link" ? "Copied" : "Copy link"}
        </button>
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(code);
            setCopied("code");
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted"
        >
          {copied === "code" ? "Copied" : "Copy code only"}
        </button>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone = "text-foreground",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${tone}`}>{value}</p>
      {sub ? <p className="mt-1 text-xs text-muted-foreground tabular-nums">{sub}</p> : null}
    </div>
  );
}

function NotAPartner() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8">
        <Handshake className="h-6 w-6 text-primary" />
        <h1 className="mt-4 text-lg font-semibold tracking-tight">Partner program</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Refer teams to CostMyAI and earn 15–35% of what they pay, for the lifetime of the account
          — the rate rises with referred revenue. You aren't part of a partner account yet.
        </p>
        <a
          href="mailto:partners@costmyai.com?subject=Partner%20program"
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Apply to become a partner
        </a>
        <Link
          to="/workspace"
          className="mt-4 block text-xs text-muted-foreground underline hover:text-foreground"
        >
          Back to your workspace
        </Link>
      </div>
    </main>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 text-sm text-muted-foreground">
      {children}
    </main>
  );
}
