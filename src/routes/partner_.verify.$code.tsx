import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { BadgeCheck, ShieldCheck } from "lucide-react";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { getPartnerBadge } from "@/lib/partner-badge.functions";

/**
 * The page a badge points at.
 *
 * A partner can copy the image anywhere; they cannot copy this page. If the
 * code is not an active CostMyAI partner, this route is a real 404 — the badge
 * is only as good as what it resolves to.
 */
export const Route = createFileRoute("/partner_/verify/$code")({
  loader: async ({ params }) => {
    const badge = await getPartnerBadge({ data: { code: params.code } });
    if (!badge) throw notFound();
    return badge;
  },
  head: ({ loaderData }) => {
    const name = loaderData?.name ?? "Partner";
    return {
      meta: [
        { title: `${name} — verified CostMyAI partner` },
        {
          name: "description",
          content: `${name} is a certified CostMyAI partner. This page shows their current tier and the date they joined the program, read live from CostMyAI's own records.`,
        },
        { property: "og:title", content: `${name} — verified CostMyAI partner` },
        {
          property: "og:description",
          content: "Verified against CostMyAI's own partner records, not a self-issued badge.",
        },
        { property: "og:type", content: "profile" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  notFoundComponent: NotVerified,
  component: VerifyPage,
});

function VerifyPage() {
  const badge = Route.useLoaderData();
  const joined = new Date(badge.joinedAt).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <MarketingShell>
      <section className="px-5 py-24 sm:px-8 sm:py-32">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-secondary">
            <BadgeCheck className="h-7 w-7 text-primary" />
          </div>
          <p className="mt-8 text-[0.7rem] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Verified partner
          </p>
          <h1 className="mt-5 text-[2.4rem] font-semibold leading-[1.02] tracking-[-0.045em] sm:text-[3.4rem]">
            {badge.name}
          </h1>

          <dl className="mx-auto mt-14 max-w-md text-left">
            <Row label="Status" value="Active partner" />
            <Row label="Tier" value={`${badge.tierName}`} />
            <Row label="Partner since" value={joined} />
            <Row label="Partner code" value={badge.code} mono />
            <div className="border-t border-border" />
          </dl>

          <p className="mx-auto mt-12 max-w-xl text-base leading-relaxed text-muted-foreground">
            This page is served by CostMyAI and reads the live partner record. A badge that does not
            resolve to a page like this one is not a CostMyAI partner badge.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link to="/partners" className="btn-gradient px-6 py-3 text-[15px]">
              About the partner program
            </Link>
            <Link to="/" className="btn-quiet px-6 py-3 text-[15px]">
              What CostMyAI does
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-t border-border py-5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={`text-base font-medium ${mono ? "font-mono text-sm" : ""}`}>{value}</dd>
    </div>
  );
}

function NotVerified() {
  return (
    <MarketingShell>
      <section className="px-5 py-24 sm:px-8 sm:py-32">
        <div className="mx-auto max-w-xl text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-secondary">
            <ShieldCheck className="h-7 w-7 text-muted-foreground" />
          </div>
          <h1 className="mt-8 text-[2.2rem] font-semibold leading-[1.05] tracking-[-0.04em] sm:text-[3rem]">
            No active partner with this code.
          </h1>
          <p className="mt-6 text-base leading-relaxed text-muted-foreground">
            Either the code was never issued, or the partner account is not active. A CostMyAI
            partner badge always resolves to a page carrying the partner's name, tier and join date.
          </p>
          <Link to="/partners" className="btn-quiet mt-10 inline-flex px-6 py-3 text-[15px]">
            About the partner program
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}
