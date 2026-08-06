import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowRight, BadgeCheck, Infinity as InfinityIcon, Receipt, ShieldCheck } from "lucide-react";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Reveal, CountUp } from "@/components/marketing/Reveal";
import { BOOK_DEMO_URL } from "@/lib/marketing-links";
import { partnerLadderQuery } from "@/lib/partner-tiers.functions";
import { formatRate, formatRateRange, formatThreshold } from "@/lib/partner-tiers";

type PartnerLadder = Awaited<ReturnType<NonNullable<ReturnType<typeof partnerLadderQuery>["queryFn"]>>>;

export const Route = createFileRoute("/partners")({
  loader: ({ context }) => context.queryClient.ensureQueryData(partnerLadderQuery()),
  head: () => ({
    meta: [
      { title: "Become a Partner — lifetime commission on every account you refer" },
      {
        name: "description",
        content:
          "Refer teams to CostMyAI and earn a share of what they pay, for as long as they pay. A 60-day referral window, attribution frozen for the life of the account, commission written only on real paid invoices.",
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
    title: "60-day window, then lifetime",
    body: "A referral link is remembered for 60 days and the first click wins — a workspace created after that needs a fresh click, or the code entered by hand. Once a workspace is attached the attribution is frozen and stays yours for the life of the account, with no reset at renewal.",
  },
  {
    icon: Receipt,
    title: "Paid invoices only",
    body: "Commission is written by the payment webhook when a real invoice is paid. Nothing is estimated, nothing is clawed back out of thin air.",
  },
  {
    icon: BadgeCheck,
    title: "Tiers you can see",
    body: "Your rate rises with referred revenue on a published ladder. Your dashboard shows exactly how far you are from the next level.",
  },
] as const;

const STEPS = [
  {
    n: "01",
    t: "Apply",
    b: "Tell us who you work with. We activate partner accounts by hand, not by form fill.",
  },
  {
    n: "02",
    t: "Share your link",
    b: "You get a link — costmyai.com/r/YOUR-CODE — and a dashboard. A click attributes the signup for 60 days; the code can also be entered by hand in Settings.",
  },
  {
    n: "03",
    t: "Get paid",
    b: "Every paid invoice from your referrals writes one line in your ledger at your current rate. Paid out monthly, on the 1st, once your balance reaches $50. Smaller balances carry over and are never lost.",
  },
] as const;

function PartnersPage() {
  const { data: ladder } = useSuspenseQuery(partnerLadderQuery());
  const range = formatRateRange(ladder);
  const tiers = ladder.tiers;
  const topRate = tiers.length ? Math.max(...tiers.map((t) => t.ratePct)) : 0;

  return (
    <MarketingShell>
      <Hero range={range} topRate={topRate} />
      <Ladder tiers={tiers} topRate={topRate} />
      <Promises />
      <Steps />
      <ClosingCta />
    </MarketingShell>
  );
}

/* ---------------------------------- hero --------------------------------- */

function Hero({ range, topRate }: { range: string | null; topRate: number }) {
  return (
    <section className="relative overflow-hidden wash-hero">
      <div className="absolute inset-0 texture-dots opacity-60" aria-hidden />
      <div className="relative mx-auto max-w-4xl px-5 pb-24 pt-24 text-center sm:px-8 sm:pb-32 sm:pt-36">
        <Reveal
          as="p"
          className="text-[0.7rem] font-medium uppercase tracking-[0.18em] text-muted-foreground"
        >
          Partner program
        </Reveal>

        <Reveal
          delay={80}
          as="h1"
          className="mt-6 text-[2.9rem] font-semibold leading-[0.98] tracking-[-0.045em] sm:text-[4.6rem]"
        >
          You recommend it once.{" "}
          <span className="text-gradient-brand">It pays for the life of the account.</span>
        </Reveal>

        <Reveal
          delay={150}
          as="p"
          className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl"
        >
          If you advise teams on their AI stack, CostMyAI is an easy first recommendation: the free
          level already cuts their bill — and every invoice they ever pay keeps paying you back.
        </Reveal>

        <Reveal delay={220} className="mt-11 flex flex-wrap items-center justify-center gap-3">
          <Link to="/partners/apply" className="btn-gradient px-6 py-3 text-[15px]">
            Apply to become a Partner
            <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href={BOOK_DEMO_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="btn-quiet px-6 py-3 text-[15px]"
          >
            Book a Demo
          </a>
        </Reveal>

        <Reveal delay={280} className="mt-6 text-sm text-muted-foreground">
          Already a partner?{" "}
          <Link to="/partner/login" className="text-foreground underline underline-offset-4">
            Sign in to the partner portal
          </Link>
        </Reveal>


        <div className="mt-20 grid grid-cols-3 gap-6 border-t border-border/60 pt-12 sm:gap-10">
          {[
            {
              node: topRate ? (
                <CountUp
                  value={topRate}
                  format={(n) => `${Math.round(n)}%`}
                  className="block text-4xl font-semibold tracking-[-0.045em] text-gradient-brand sm:text-6xl"
                />
              ) : (
                <span className="block text-4xl font-semibold tracking-[-0.045em] text-gradient-brand sm:text-6xl">
                  {range ?? "—"}
                </span>
              ),
              label: "Top commission rate",
            },
            { node: <Stat>60 days</Stat>, label: "Click-to-signup window, then lifetime" },
            { node: <Stat>Paid only</Stat>, label: "When commission is written" },
          ].map((s, i) => (
            <Reveal key={s.label} delay={300 + i * 90}>
              {s.node}
              <p className="mt-3 text-[0.65rem] font-medium uppercase tracking-[0.14em] text-muted-foreground sm:text-[0.7rem]">
                {s.label}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Stat({ children }: { children: React.ReactNode }) {
  return (
    <span className="block text-4xl font-semibold tracking-[-0.045em] text-foreground sm:text-6xl">
      {children}
    </span>
  );
}

/* --------------------------------- ladder -------------------------------- */

function Ladder({
  tiers,
  topRate,
}: {
  tiers: PartnerLadder["tiers"];
  topRate: number;
}) {
  return (
    <section className="border-y border-border bg-card">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
        <SectionHead
          eyebrow="Commission ladder"
          title="The more you refer, the higher every future invoice pays."
          lead="Your rate is set by lifetime referred revenue and applies to everything your referrals pay from that point on. Read live from the same table that prices your payouts."
        />

        <div className="mt-20 grid grid-cols-2 items-end gap-x-4 gap-y-12 sm:grid-cols-5 sm:gap-x-6">
          {tiers.map((t, i) => {
            const height = topRate ? Math.max(18, (t.ratePct / topRate) * 100) : 100;
            const isTop = t.ratePct === topRate;
            return (
              <Reveal key={t.tier} delay={i * 110} className="flex flex-col justify-end">
                <CountUp
                  value={t.ratePct}
                  format={(n) => `${n.toFixed(n % 1 === 0 ? 0 : 1)}%`}
                  className={`block text-3xl font-semibold tracking-[-0.04em] sm:text-[2.6rem] ${
                    isTop ? "text-gradient-brand" : "text-foreground"
                  }`}
                />
                <div className="mt-4 h-40 w-full">
                  <div
                    className={`w-full rounded-t-md transition-[height] duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                      isTop ? "fill-gradient-brand" : "fill-gradient-brand-soft"
                    }`}
                    style={{ height: `${height}%`, marginTop: `${100 - height}%` }}
                    aria-hidden
                  />
                </div>
                <p className="mt-4 border-t border-border pt-3 text-sm font-semibold tracking-[-0.01em]">
                  {t.name}
                </p>
                <p className="num mt-1 text-xs tabular-nums text-muted-foreground">
                  from {formatThreshold(t.minLifetimeUsd)} referred
                </p>
                <span className="sr-only">{formatRate(t.ratePct)} commission</span>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------- promises ------------------------------- */

function Promises() {
  return (
    <section className="wash-section">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
        <SectionHead
          eyebrow="The deal"
          title="No cookie games. No estimated money."
          lead="Three commitments that decide whether a partner program is worth your reputation."
        />

        <div className="mx-auto mt-16 max-w-4xl">
          {PROMISES.map((p, i) => (
            <Reveal
              key={p.title}
              delay={i * 90}
              className="group grid grid-cols-[auto_1fr] items-start gap-5 border-t border-border py-9 sm:gap-8 sm:py-11"
            >
              <p.icon className="mt-1 h-6 w-6 shrink-0 text-primary transition-transform duration-500 group-hover:scale-110" />
              <div className="min-w-0">
                <h3 className="text-xl font-semibold tracking-[-0.03em] sm:text-2xl">{p.title}</h3>
                <p className="mt-2 max-w-2xl text-base leading-relaxed text-muted-foreground">
                  {p.body}
                </p>
              </div>
            </Reveal>
          ))}
          <div className="border-t border-border" />
        </div>
      </div>
    </section>
  );
}

/* --------------------------------- steps --------------------------------- */

function Steps() {
  return (
    <section className="border-y border-border bg-card">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
        <SectionHead
          eyebrow="How it works"
          title="Three steps from a recommendation to a payout."
        />

        <div className="mx-auto mt-16 max-w-4xl">
          {STEPS.map((s, i) => (
            <Reveal
              key={s.n}
              delay={i * 90}
              className="group grid gap-4 border-t border-border py-10 sm:grid-cols-[9rem_1fr] sm:gap-10 sm:py-12"
            >
              <span
                aria-hidden
                className="num pointer-events-none select-none text-[3.5rem] leading-none text-gradient-brand opacity-30 transition-opacity duration-500 group-hover:opacity-100 sm:text-[5rem]"
              >
                {s.n}
              </span>
              <div className="sm:pt-2">
                <h3 className="text-2xl font-semibold tracking-[-0.035em] sm:text-[2rem]">{s.t}</h3>
                <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
                  {s.b}
                </p>
              </div>
            </Reveal>
          ))}
          <div className="border-t border-border" />
        </div>

        <Reveal delay={120} className="mx-auto mt-20 max-w-3xl text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-secondary">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <h3 className="mt-6 text-2xl font-semibold tracking-[-0.035em] sm:text-[2rem]">
            Neutrality applies to partners too.
          </h3>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            You see which workspaces are yours, which level they are on, and every dollar you have
            earned. You never see their spend, their usage or their people.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------- closing cta ------------------------------ */

function ClosingCta() {
  return (
    <section className="px-5 py-24 sm:px-8 sm:py-32">
      <Reveal className="mx-auto max-w-3xl text-center">
        <h2 className="text-[2.4rem] font-semibold leading-[1.02] tracking-[-0.045em] sm:text-[3.6rem]">
          Start earning on the <span className="text-gradient-brand">next</span> recommendation you
          make.
        </h2>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link to="/partners/apply" className="btn-gradient px-6 py-3 text-[15px]">
            Apply to become a Partner
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link to="/pricing" className="btn-quiet px-6 py-3 text-[15px]">
            See what your referrals pay
          </Link>
        </div>
      </Reveal>
    </section>
  );
}

/* ------------------------------- section head ----------------------------- */

function SectionHead({
  eyebrow,
  title,
  lead,
}: {
  eyebrow: string;
  title: string;
  lead?: string;
}) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <Reveal
        as="p"
        className="text-[0.7rem] font-medium uppercase tracking-[0.18em] text-muted-foreground"
      >
        {eyebrow}
      </Reveal>
      <Reveal
        delay={80}
        as="h2"
        className="mt-5 text-[2.1rem] font-semibold leading-[1.05] tracking-[-0.04em] sm:text-[3.2rem]"
      >
        {title}
      </Reveal>
      {lead ? (
        <Reveal
          delay={150}
          as="p"
          className="mt-6 text-base leading-relaxed text-muted-foreground sm:text-lg"
        >
          {lead}
        </Reveal>
      ) : null}
    </div>
  );
}
