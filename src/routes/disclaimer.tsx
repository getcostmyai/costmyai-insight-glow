import { createFileRoute } from "@tanstack/react-router";

import { LegalPage, LegalSection } from "@/components/marketing/LegalPage";

export const Route = createFileRoute("/disclaimer")({
  head: () => ({
    meta: [
      { title: "Disclaimer — CostMyAI" },
      {
        name: "description",
        content:
          "Where CostMyAI's pricing and benchmark data comes from, what a switching recommendation is not, and who owns the decision to switch.",
      },
      { property: "og:title", content: "Disclaimer — CostMyAI" },
      {
        property: "og:description",
        content:
          "Public prices, independent benchmarks, no paid placement. Not financial or legal advice.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DisclaimerPage,
});

function DisclaimerPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Disclaimer."
      intro={
        <>
          CostMyAI provides pricing, benchmark, and market structure information sourced from public
          provider pricing pages and independent third party evaluation feeds. We do not run our own
          private evaluations and we are never paid for placement.
        </>
      }
    >
      <LegalSection title="Not financial or legal advice">
        <p>
          Nothing on this site or within the product constitutes financial, legal, or investment
          advice. Switching recommendations are based on measured price and quality data at the time
          they were generated and are not a guarantee of future performance, availability, or
          pricing from any third party provider. A benchmark score, however clean the margin,
          measures performance on the benchmark's own task set — it does not measure performance on
          your specific data, prompts, or edge cases. Clearing the quality bar is evidence a switch
          is worth testing, not a guarantee it will behave identically on your own workload.
        </p>
      </LegalSection>

      <LegalSection title="Data accuracy">
        <p>
          We synchronize pricing and benchmark data continuously from public sources and state the
          freshness of that data directly alongside every figure we show. Despite this, provider
          pricing pages and published benchmarks can themselves contain errors or change without
          notice, and we cannot guarantee zero latency between a real world change and its
          reflection on our platform.
        </p>
      </LegalSection>

      <LegalSection title="Third party providers">
        <p>
          CostMyAI is not affiliated with, endorsed by, or acting on behalf of any AI model provider
          referenced on this site. Provider names and trademarks belong to their respective owners.
        </p>
      </LegalSection>

      <LegalSection title="No liability for switching outcomes">
        <p>
          Any decision to switch, or to enable automated switching, based on information provided by
          CostMyAI remains the customer's own decision. We are not liable for outcomes resulting
          from a switch, including but not limited to changes in provider pricing or service after a
          switch was made.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
