import { createFileRoute } from "@tanstack/react-router";

import { LegalPage, LegalSection, MailLink } from "@/components/marketing/LegalPage";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — CostMyAI" },
      {
        name: "description",
        content:
          "The terms of using CostMyAI: what the service does, what a Certify recommendation guarantees and what it does not, billing, termination and liability.",
      },
      { property: "og:title", content: "Terms of Service — CostMyAI" },
      {
        property: "og:description",
        content:
          "What the service does, what a recommendation guarantees, and how billing and termination work.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms of"
      accent="Service."
      updated="2 August 2026"
      intro={
        <>
          These terms govern your use of CostMyAI. By creating an account or using the service, you
          agree to them.
        </>
      }
    >
      <LegalSection title="The service">
        <p>
          CostMyAI provides visibility, certification, and optional automated switching of AI model
          usage based on data you choose to share via the Verification Engine, which runs inside
          your own environment.
        </p>
      </LegalSection>

      <LegalSection title="Your responsibilities">
        <p>
          You are responsible for the accuracy of the environment you connect, for maintaining the
          security of your own account credentials, and for any actions taken through automated
          switching features you explicitly enable.
        </p>
      </LegalSection>

      <LegalSection title="What we guarantee, and what we do not">
        <p>
          We guarantee that recommendations under Certify are only made when the candidate model's
          measured score falls inside a defined equivalence band, per our published Methodology. We
          do not guarantee that any specific switch will produce a specific outcome for your
          workload, since real world performance depends on factors outside a benchmark score.
        </p>
        <p>
          Autonomous switching under Govern only ever applies changes that have separately cleared
          this same bar, re-checked at the moment of action, not merely at the moment it was first
          evaluated.
        </p>
      </LegalSection>

      <LegalSection title="Billing">
        <p>
          Compare is free. Certify, Rightsize and Govern are paid plans, billed monthly or yearly
          through Stripe and renewing until cancelled. Cancelling stops the next renewal and keeps
          access until the end of the paid period. Downgrading pauses capabilities above your new
          level without deleting your history.
        </p>
      </LegalSection>

      <LegalSection title="Termination">
        <p>
          Either party may terminate at any time per the cancellation terms in your account
          settings. Data handling on termination follows the retention rules in our Privacy Policy.
        </p>
      </LegalSection>

      <LegalSection title="Limitation of liability">
        <p>
          CostMyAI is not in your inference path: if our service is unavailable, your models keep
          serving traffic. The service is provided as-is, and to the extent permitted by law our
          aggregate liability is limited to the fees you paid in the twelve months preceding a
          claim.
        </p>
      </LegalSection>

      <LegalSection title="Changes to these terms">
        <p>We will notify active accounts of material changes before they take effect.</p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          <MailLink />
        </p>
      </LegalSection>
    </LegalPage>
  );
}
