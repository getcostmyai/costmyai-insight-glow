import { createFileRoute } from "@tanstack/react-router";

import { MarketingShell } from "@/components/marketing/MarketingShell";

export const Route = createFileRoute("/legal/terms")({
  head: () => ({
    meta: [
      { title: "Terms — CostMyAI" },
      {
        name: "description",
        content:
          "The terms of using CostMyAI: what a recommendation is and is not, how switching works, plan billing, and the neutrality commitment we hold ourselves to.",
      },
      { property: "og:title", content: "Terms — CostMyAI" },
      {
        property: "og:description",
        content:
          "What a CostMyAI recommendation claims, how switching and billing work, and our neutrality commitment.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <MarketingShell>
      <article className="mx-auto max-w-3xl px-5 py-20 sm:px-8">
        <p className="eyebrow">Terms</p>
        <h1 className="mt-3 text-4xl font-bold tracking-[-0.03em]">Terms of service</h1>
        <p className="mt-5 text-[15px] leading-relaxed text-muted-foreground">
          Plain terms for a measurement product. Using CostMyAI means accepting them.
        </p>

        <Section title="What a recommendation claims">
          <p>
            A recommendation states that, on the named evaluation and within its published
            measurement margin, the suggested model or host is not distinguishable in quality from
            what you run today, and costs less on your own token mix. It is a claim about that
            measurement — not a guarantee about your specific prompts, your users, or a task class
            we have not measured.
          </p>
        </Section>

        <Section title="Neutrality">
          <p>
            We take no payment, revenue share, or other consideration from any model vendor or host
            in exchange for placement, ranking, or inclusion. Recommendations are ordered by cost
            among options that clear the quality bar, with ties broken by cost and then
            alphabetically by model identifier. If this ever changes, it will be disclosed on this
            page before it takes effect.
          </p>
        </Section>

        <Section title="Switching">
          <p>
            On Rightsize you activate switches yourself; on Govern we may activate switches
            autonomously within the equivalence band you have approved. Every switch is recorded,
            reversible, and attributed. You remain responsible for the output of the models you
            run, before and after a switch.
          </p>
        </Section>

        <Section title="Your credentials">
          <p>
            You do not give us provider credentials, and we do not ask for them. The ingest
            container runs inside your infrastructure under your control, and you are responsible
            for keeping your ingest token secret. Rotate or revoke it from your settings at any
            time.
          </p>
        </Section>

        <Section title="Plans and billing">
          <p>
            Compare is free. Paid plans are billed monthly or yearly through Stripe and renew until
            cancelled. Cancelling stops the next renewal and keeps access until the end of the paid
            period; downgrading pauses capabilities above your new rung without deleting your
            history.
          </p>
        </Section>

        <Section title="Availability and liability">
          <p>
            CostMyAI is not in your inference path: if our service is unavailable, your models keep
            serving traffic. We provide the service as-is and our aggregate liability is limited to
            the fees you paid in the twelve months preceding a claim.
          </p>
        </Section>

        <Section title="Contact">
          <p>Questions about these terms go to legal@costmyai.com.</p>
        </Section>
      </article>
    </MarketingShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}
