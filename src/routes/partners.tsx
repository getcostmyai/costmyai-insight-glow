import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowRight, BadgeCheck, Handshake, Infinity as InfinityIcon, Receipt } from "lucide-react";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { BOOK_DEMO_URL } from "@/lib/marketing-links";
import { partnerLadderQuery } from "@/lib/partner-tiers.functions";
import { formatRate, formatRateRange, formatThreshold } from "@/lib/partner-tiers";

export const Route = createFileRoute("/partners")({
  loader: ({ context }) => context.queryClient.ensureQueryData(partnerLadderQuery()),
  head: () => ({
    meta: [
      { title: "Become a Partner — lifetime commission on every account you refer" },
      {
        name: "description",
        content:
          "Refer teams to CostMyAI and earn a share of what they pay, for as long as they pay. Lifetime attribution, commission written only on real paid invoices, transparent tiers.",
      },
      { property: "og:title", content: "Become a CostMyAI partner" },
      {
        property: "og:description",
        content:
          "Lifetime commission on referred revenue, paid on real invoices — never estimated.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PartnersPage,
});


const PROMISES = [
  {
    icon: InfinityIcon,
    title: "Lifetime attribution",
    body: "A workspace attaches your code once and stays yours for the life of the account — no 90-day cookie, no reset at renewal.",
  },
  {
    icon: Receipt,
    title: "Paid invoices only",
    body: "Commission is written by the payment webhook when a real invoice is paid. Nothing is estimated, nothing is clawed back out of thin air.",
  },
  {
    icon: BadgeCheck,
    title: "Tiers you can see",
    body: "Your rate rises with referred revenue on a published ladder. Your dashboard shows exactly how far you are from the next rung.",
  },
] as const;

const STEPS = [
  { n: "01", t: "Apply", b: "Tell us who you work with. We activate partner accounts by hand, not by form fill." },
  { n: "02", t: "Share your code", b: "You get a referral code and a dashboard. A workspace enters it once at signup." },
  { n: "03", t: "Get paid", b: "Every paid invoice from your referrals writes one line in your ledger at your current rate." },
] as const;

function PartnersPage() {
  return (
    <MarketingShell>
      <section className="px-5 pb-14 pt-16 sm:px-8 sm:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-medium text-primary">
            <Handshake className="h-3.5 w-3.5" />
            Partner program
          </div>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">
            Earn <span className="text-primary num tabular-nums">15–35%</span> for the lifetime of
            every account you refer.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
            If you advise teams on their AI stack, CostMyAI is an easy first recommendation: the
            free rung already cuts their bill, and you keep earning for as long as they stay.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a
              href="mailto:partners@costmyai.com?subject=Partner%20program%20application"
              className="btn-gradient px-5 py-2.5 text-sm"
            >
              Apply to become a partner
            </a>
            <a
              href={BOOK_DEMO_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              Book a Demo
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-card px-5 py-14 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-2xl font-semibold tracking-tight">Commission ladder</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Your rate is set by lifetime referred revenue and applies to everything your referrals
            pay from that point on.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {TIERS.map((t) => (
              <div key={t.name} className="rounded-2xl border border-border bg-background p-5 text-center">
                <p className="text-xs text-muted-foreground">{t.name}</p>
                <p className="num mt-2 text-2xl font-semibold tabular-nums text-primary">{t.rate}</p>
                <p className="num mt-1 text-xs tabular-nums text-muted-foreground">from {t.from}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-16 sm:px-8">
        <div className="mx-auto grid max-w-6xl gap-4 sm:grid-cols-3">
          {PROMISES.map((p) => (
            <div key={p.title} className="rounded-2xl border border-border p-6">
              <p.icon className="h-5 w-5 text-primary" />
              <h2 className="mt-4 text-sm font-semibold">{p.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-border bg-card px-5 py-16 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="rounded-2xl border border-border bg-background p-6">
                <p className="num text-2xl font-semibold tabular-nums text-primary">{s.n}</p>
                <h3 className="mt-3 text-sm font-semibold">{s.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.b}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 rounded-2xl border border-border bg-background p-6">
            <h3 className="text-sm font-semibold">What a partner can and cannot see</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              You see which workspaces are yours, which rung they are on, and every dollar you have
              earned. You never see their spend, their usage or their people. Neutrality applies to
              partners too.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <a
                href="mailto:partners@costmyai.com?subject=Partner%20program%20application"
                className="btn-gradient px-5 py-2.5 text-sm"
              >
                Apply to become a partner
              </a>
              <Link
                to="/pricing"
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
              >
                See what your referrals pay
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
