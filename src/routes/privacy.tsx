import { createFileRoute } from "@tanstack/react-router";

import { LegalPage, LegalSection, MailLink } from "@/components/marketing/LegalPage";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — CostMyAI" },
      {
        name: "description",
        content:
          "What CostMyAI collects and what it never touches: no provider API keys, no prompts, no completions. Account, usage and analytics data explained, with your GDPR rights.",
      },
      { property: "og:title", content: "Privacy Policy — CostMyAI" },
      {
        property: "og:description",
        content:
          "Zero credentials by design. What we collect, why, who processes it, and how to exercise your rights.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy"
      accent="Policy."
      updated="20 August 2026"
      intro={
        <>
          CostMyAI ("we," "us," "our") is operated from Vienna, Austria. This policy explains what
          data we collect, why, and what rights you have over it.
        </>
      }
    >
      <LegalSection title="What we do not collect">
        <p>
          We do not collect, store, or have access to your AI provider API keys or credentials. The
          Verification Engine that reads your usage data runs inside your own environment. Your
          provider keys never leave it.
        </p>
      </LegalSection>

      <LegalSection title="What we do collect">
        <p>
          <strong className="text-foreground">Account data:</strong> name, email, workspace details,
          and billing information necessary to provide the service.
        </p>
        <p>
          <strong className="text-foreground">Usage and billing data you choose to share:</strong>{" "}
          aggregate, provider neutral records of model usage, spend, and switching activity, pushed
          from your own environment via the Verification Engine. Model outputs are never sent to
          us, and prompt content is only ever involved in the one case described immediately below.
          Which connector image you run decides that, and the quickstart now hands new customers
          the <code>v3</code> image by default, so this is the posture you get unless you choose
          another tag. On the <code>v1</code> image, the task label is derived from the request
          path and model name alone and no request body is read. On the <code>v2</code> image,
          local classification is on by default: request text is read inside your own container to
          derive a more accurate label, and <code>COSTMYAI_CLASSIFY_LOCAL=false</code> turns it
          off. On both of those images, only the label, a confidence number and feature names leave
          your environment, and no prompt text is transmitted, stored or logged by us.
        </p>
        <p>
          <strong className="text-foreground">
            The one exception, on the v3 image — and v3 is what a new install runs:
          </strong>{" "}
          the <code>v3</code> connector image adds remote classification, on by default in that tag
          only. When the in-container rules cannot place a request, the extracted request text is
          sent to us and labelled by a model. That call runs after your response has already been
          returned, so it never delays your traffic. The text is used for that single labelling
          call and is not persisted by us; the only thing retained is the resulting label. Because
          this is now the default rather than something you opt into, we state it here plainly: if
          you do not want it, set <code>COSTMYAI_CLASSIFY_REMOTE=false</code> and the v3 image
          behaves exactly like v2, or run the <code>v2</code> image, where the capability does not
          exist at all, or the <code>v1</code> image, which reads no request body whatsoever. Both
          remain published and supported; your own environment variable always overrides the tag's
          default.
        </p>

        <p>
          <strong className="text-foreground">Website and product analytics:</strong> we use Google
          Analytics to understand how visitors use this site (pages visited, general location,
          device and browser type, session behavior). Google Analytics sets cookies and processes
          data including your IP address, per Google's own IP handling settings, and device
          identifiers. This data is processed by Google in its own role as a processor on our
          behalf, and is transferred to Google's servers, which can include servers outside the
          EU/EEA.
        </p>
      </LegalSection>

      <LegalSection title="Cookies and consent">
        <p>
          Google Analytics is not strictly necessary for the site to function, so under GDPR it may
          only run after you have given consent, not merely with an opt-out available afterward.
        </p>
        <p>
          You can withdraw consent at any time through your cookie settings, or by using your
          browser's own cookie controls.
        </p>
      </LegalSection>

      <LegalSection title="Why we process it">
        <p>
          To provide the service you signed up for, to bill you accurately, to respond to support
          requests, and where you have consented, to contact you about product updates.
        </p>
      </LegalSection>

      <LegalSection title="Legal basis (EU/EEA users)">
        <p>
          We process personal data on the basis of contract necessity (to provide the service),
          legitimate interest (product improvement, security), and consent (marketing
          communications, where applicable).
        </p>
      </LegalSection>

      <LegalSection title="Data sharing">
        <p>
          We do not sell personal data. We share data with subprocessors strictly necessary to run
          the service and the site, each bound by their own data processing agreement:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-foreground">Google (Google Analytics):</strong> website
            analytics, per the Cookies and consent section above.
          </li>
          <li>
            <strong className="text-foreground">Stripe:</strong> payment processing and subscription
            billing.
          </li>
          <li>
            <strong className="text-foreground">Our hosting and database providers:</strong>{" "}
            operation of the application and storage of account and usage records.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="How your usage data is used across service tiers">
        <p>
          CostMyAI sells four tiers: Compare, Certify, Rightsize and Govern. The usage data you
          share is used to compute recommendations for <strong className="text-foreground">all
          four</strong>, regardless of which tier you are subscribed to, including tiers you have
          not bought and tiers that are not yet generally released.
        </p>
        <p>
          We do this for one reason: a recommendation engine can only be validated against real
          usage. Computing the higher-tier results on live data is how we check that they are
          correct before those tiers go on general sale.
        </p>
        <p>
          Results you are not entitled to are computed and stored, but they are not shown to you.
          The database itself enforces this: a workspace can only read a recommendation whose tier
          is at or below the plan it actually pays for. If you later upgrade, the results for that
          tier become visible to you; if you never upgrade, you never see them. These computed
          results are your workspace's data, are covered by the same retention and deletion rules
          below, and are never shared with, sold to, or used to advise another customer.
        </p>
      </LegalSection>

      <LegalSection title="Data retention">
        <p>
          We retain account and billing data for as long as your account is active and as required
          by law afterward. Usage data pushed via the Verification Engine, and everything derived
          from it, follows the retention rules set out in the{" "}
          <a
            href="/legal/methodology"
            className="font-semibold text-foreground underline underline-offset-2 hover:text-primary"
          >
            Retention section of our Methodology page
          </a>
          : kept while your workspace exists, deleted within 30 days of closure or on request.
        </p>
      </LegalSection>

      <LegalSection title="Your rights">
        <p>
          If you are located in the EU/EEA, UK, or another jurisdiction with equivalent protections,
          you have the right to access, correct, delete, or export your personal data, and to object
          to or restrict certain processing. Contact <MailLink /> to exercise any of these rights.
        </p>
      </LegalSection>

      <LegalSection title="International transfers">
        <p>
          Google Analytics can transfer data to Google servers outside the EU/EEA. Google is
          certified under the EU-U.S. Data Privacy Framework and relies on Standard Contractual
          Clauses for such transfers, per Google's own published terms. Any other subprocessor
          outside the EU/EEA operates under an equivalent transfer mechanism.
        </p>
      </LegalSection>

      <LegalSection title="Changes to this policy">
        <p>We will notify active accounts of material changes to this policy before they take effect.</p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          <MailLink />
        </p>
      </LegalSection>
    </LegalPage>
  );
}
