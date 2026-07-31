import { createFileRoute } from "@tanstack/react-router";

import { MarketingShell } from "@/components/marketing/MarketingShell";

export const Route = createFileRoute("/legal/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy — CostMyAI" },
      {
        name: "description",
        content:
          "What CostMyAI collects and what it refuses to: metadata only, no prompts or completions, no provider API keys, no billing polling.",
      },
      { property: "og:title", content: "Privacy — CostMyAI" },
      {
        property: "og:description",
        content: "Metadata only. No prompt content, no provider credentials, no billing polling.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <MarketingShell>
      <article className="mx-auto max-w-3xl px-5 py-20 sm:px-8">
        <p className="eyebrow">Privacy</p>
        <h1 className="mt-3 text-4xl font-bold tracking-[-0.03em]">What we hold, and what we refuse to</h1>
        <p className="mt-5 text-[15px] leading-relaxed text-muted-foreground">
          CostMyAI is a cost advisor, not a proxy. It sits beside your inference path rather than in
          it, which lets us keep the collected surface deliberately narrow.
        </p>

        <Section title="What the ingest container sends">
          <p>
            For each request your gateway handles, we receive: the model identifier, the host that
            served it, a task class label, input and output token counts, latency, status, and a
            timestamp. That is the entire schema. Fields carrying prompt or completion text are
            rejected at the ingest boundary rather than dropped later.
          </p>
        </Section>

        <Section title="What we never receive">
          <ul className="list-disc space-y-2 pl-5">
            <li>Prompts, completions, embeddings, or any user content.</li>
            <li>Provider API keys or credentials of any kind. They stay in your container.</li>
            <li>End-user identifiers from your application.</li>
            <li>
              Your provider billing data, unless you push an invoice to us yourself for
              reconciliation. We never poll a billing API.
            </li>
          </ul>
        </Section>

        <Section title="Account data">
          <p>
            We store what an account needs: your email, your workspace and its members, your plan
            and its Stripe subscription status, and the audit trail of switches your workspace
            activated. Payment card details are handled by Stripe and never reach us.
          </p>
        </Section>

        <Section title="Isolation">
          <p>
            Every workspace row is protected by row-level security keyed to workspace membership. A
            member of one workspace cannot read another's usage, recommendations, or switches, and
            the public demo workspace is the only one any unauthenticated visitor can read.
          </p>
        </Section>

        <Section title="Retention and deletion">
          <p>
            Usage metadata is retained for rolling analysis and aggregated into daily rollups.
            Deleting your workspace removes its usage events, recommendations, switches and audit
            records. Ask us and we will confirm the deletion in writing.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about any of this, including a data export or deletion request, go to
            privacy@costmyai.com.
          </p>
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
