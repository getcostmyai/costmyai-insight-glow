import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { trackPartnerEvent } from "@/lib/partner-telemetry.functions";
import { shouldFire } from "@/lib/telemetry/fire-once";
import { ArrowRight, BadgeCheck, Infinity as InfinityIcon, Receipt, ShieldCheck } from "lucide-react";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Reveal, CountUp } from "@/components/marketing/Reveal";
import { PriceDriftRibbon } from "@/components/marketing/PriceDriftRibbon";
import { BOOK_DEMO_URL } from "@/lib/marketing-links";
import { partnerLadderQuery } from "@/lib/partner-tiers.functions";
import { marketingStatsQuery } from "@/lib/marketing.functions";
import { formatRate, formatRateRange, formatThreshold } from "@/lib/partner-tiers";

type PartnerLadder = Awaited<ReturnType<NonNullable<ReturnType<typeof partnerLadderQuery>["queryFn"]>>>;

export const Route = createFileRoute("/partners")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(partnerLadderQuery()),
      context.queryClient.ensureQueryData(marketingStatsQuery()),
    ]);
  },
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
      { property: "og:url", content: "https://www.costmyai.com/partners" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://www.costmyai.com/partners" }],
  }),
  component: PartnersPage,
});


const PROMISES = [
  {
    icon: InfinityIcon,
    title: "60-day window, then lifetime",
    body: "A referral link is remembered for 60 days and the first click wins. A workspace created after that needs a fresh click, or the code entered by hand. Once a workspace is attached the attribution is frozen and stays yours for the life of the account, with no reset at renewal.",
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
  const { data: stats } = useSuspenseQuery(marketingStatsQuery());
  // One view per page load. Unlike the estimator this is the whole page, so
  // mounting *is* seeing — no viewport observer needed.
  const track = useServerFn(trackPartnerEvent);
  useEffect(() => {
    if (!shouldFire("partner_page_viewed")) return;
    void track({ data: { event: "partner_page_viewed" } }).catch(() => {});
  }, [track]);

  const range = formatRateRange(ladder);
  const tiers = ladder.tiers;
  const topRate = tiers.length ? Math.max(...tiers.map((t) => t.ratePct)) : 0;
  const moves = stats.priceChangesTracked;

  return (
    <MarketingShell>
      <Hero range={range} topRate={topRate} moves={moves} />
      <Ladder tiers={tiers} topRate={topRate} moves={moves} />
      <Promises />
      <BeyondCommission moves={moves} />
      <Steps />
      <ClosingCta />
    </MarketingShell>
  );
}


/* --------------------------- beyond the commission ------------------------ */

/**
 * Two of these exist today and two are commitments. The copy says which is
 * which, in the same words we would use in a call — a partner should never
 * discover that something on this page was aspirational.
 */
const BEYOND = [
  {
    state: "Live today",
    title: "A badge that can be checked, not just displayed",
    body: "On activation you get a Certified Partner badge and LinkedIn banners generated from your own record, plus a verification link on costmyai.com carrying your name, tier and join date. Anyone can open the link. Nobody can issue one for themselves.",
  },
  {
    state: "Live today",
    title: "The market data before it is published",
    body: "The public Intelligence page only publishes a month once it is frozen. Your partner dashboard shows the month while it is still moving — price moves, cuts and new listings across every model and host we track.",
  },
  {
    state: "Commitment",
    title: "Co-marketing on a named case study",
    body: "From the second tier up, we will build and publish a case study with you. This needs a client willing to be named, so it starts the day you have one — not before. We will not publish an anonymous composite and call it a case study.",
  },
  {
    state: "Commitment",
    title: "A direct line on the roadmap",
    body: "We will take partner feedback directly, on a call rather than through a form, and tell you plainly what we will and will not build. This is a person's time, not a product feature: ask for it and we will book it.",
  },
] as const;

function BeyondCommission({ moves }: { moves: number }) {
  return (
    <section className="relative overflow-hidden border-t border-border wash-brand">
      {/* The echo: same band, quarter-turned, pinned to the gutter. */}
      <PriceDriftRibbon
        moves={moves}
        orientation="vertical"
        className="absolute inset-y-0 right-0 hidden w-[16%] opacity-[0.18] [mask-image:linear-gradient(270deg,#000,transparent)] lg:block"
      />
      <div className="relative mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">

        <SectionHead
          eyebrow="Beyond the commission"
          title="What a partner account actually gets you."
          lead="Two of these work the day you are activated. Two are commitments we honour when you take us up on them, and we say so rather than dressing them up as features."
        />

        <div className="mx-auto mt-16 max-w-4xl">
          {BEYOND.map((b, i) => (
            <Reveal
              key={b.title}
              delay={i * 90}
              className="grid gap-3 border-t border-border py-9 sm:grid-cols-[10rem_1fr] sm:gap-8 sm:py-11"
            >
              <p
                className={`text-[0.65rem] font-medium uppercase tracking-[0.16em] sm:pt-2 ${
                  b.state === "Live today" ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {b.state}
              </p>
              <div className="min-w-0">
                <h3 className="text-xl font-semibold tracking-[-0.03em] sm:text-2xl">{b.title}</h3>
                <p className="mt-2 max-w-2xl text-base leading-relaxed text-muted-foreground">
                  {b.body}
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

/* ---------------------------------- hero --------------------------------- */

function Hero({
  range,
  topRate,
  moves,
}: {
  range: string | null;
  topRate: number;
  moves: number;
}) {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div
        className="pointer-events-none absolute inset-x-0 -top-24 h-[130%] mesh-brand mesh-drift"
        aria-hidden
      />
      {/* First sighting of the band: a shallow diagonal, almost gone. */}
      <PriceDriftRibbon
        moves={moves}
        orientation="diagonal"
        className="absolute inset-x-0 bottom-0 h-[55%] opacity-[0.12] [mask-image:linear-gradient(180deg,transparent,#000_70%)]"
      />
      <div className="absolute inset-0 texture-dots opacity-50" aria-hidden />
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
            { node: <Stat>Lifetime</Stat>, label: "Commission on every invoice they ever pay" },
            { node: <Stat>Opportunity</Stat>, label: "Be the advisor who turns a cost line into a win" },
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
  moves,
}: {
  tiers: PartnerLadder["tiers"];
  topRate: number;
  moves: number;
}) {
  return (
    <section className="relative overflow-hidden border-y border-border wash-brand">
      {/* The statement placement: a whisper at the bottom edge, never behind body copy. */}
      <PriceDriftRibbon
        moves={moves}
        className="absolute inset-x-0 bottom-0 h-[26%] opacity-25 [mask-image:linear-gradient(180deg,transparent_0%,transparent_70%,#000_100%)]"
      />
      <div className="relative mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">

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
    <section className="border-t border-border">
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
    <section className="border-t border-border">
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
