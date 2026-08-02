import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Circle, Copy, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Reveal } from "@/components/marketing/Reveal";

/**
 * Canonical go-live state for the Lovable-provisioned Stripe sandbox.
 * This page is read-only documentation; the actual claim link lives in the
 * Lovable Payments tab because Lovable provisions and owns the sandbox URL.
 */
const SANDBOX_ACCOUNT_ID = "acct_1TwRfvBFjkfGLhqR";

const STEPS = [
  {
    id: "claim_account",
    title: "Connect your sandbox to a new or existing Stripe account",
    status: "in_progress" as const,
    action: "Open the Lovable Payments tab and click the Stripe claim link.",
    detail:
      "This creates or links a Stripe account for the Lovable-provisioned sandbox. Choose to sign in to an existing Stripe account or create a new one.",
  },
  {
    id: "setup_live_account",
    title: "Complete the go-live form on Stripe",
    status: "not_started" as const,
    action: "In Stripe, verify your business, add your bank, and submit the activation form.",
    detail:
      "Stripe will ask for business details, a website, a bank account for payouts, and two-step authentication. Submit the form to move to the next step.",
  },
  {
    id: "install_app",
    title: "Add the Lovable app on your LIVE Stripe account",
    status: "not_started" as const,
    action: "Install the Lovable Stripe app when Stripe prompts you after onboarding.",
    detail:
      "This lets Lovable manage checkout sessions and products in live mode. If Stripe offers to copy items from the sandbox, include the Lovable app.",
  },
  {
    id: "provision_live_keys",
    title: "Create live API keys for your Stripe account",
    status: "not_started" as const,
    action: "No action required — Lovable provisions live keys automatically.",
    detail:
      "Once the Lovable app is installed on your live account, webhooks trigger the provisioning of live publishable and secret keys.",
  },
  {
    id: "readiness_check",
    title: "Run the readiness check",
    status: "not_started" as const,
    action: "Return to the Lovable Payments tab and run the automated readiness check.",
    detail:
      "The check validates products, prices, webhooks, and other live configuration. Fix any failures before accepting real payments.",
  },
];

export const Route = createFileRoute("/payments")({
  head: () => ({
    meta: [
      { title: "Activate real payments — CostMyAI" },
      {
        name: "description",
        content:
          "Step-by-step guide to completing the Stripe go-live flow and accepting real payments with CostMyAI.",
      },
      { property: "og:title", content: "Activate real payments — CostMyAI" },
      {
        property: "og:description",
        content:
          "Complete the Stripe go-live flow: claim your sandbox, activate your live account, install the Lovable app, and run the readiness check.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/payments" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "/payments" }],
  }),
  component: PaymentsPage,
});

function PaymentsPage() {
  const [copied, setCopied] = useState(false);

  async function copyAccountId() {
    await navigator.clipboard.writeText(SANDBOX_ACCOUNT_ID);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <MarketingShell>
      <section className="px-5 pb-16 pt-24 sm:px-8 sm:pb-24 sm:pt-36">
        <div className="mx-auto max-w-5xl">
          <Reveal className="max-w-3xl">
            <p className="eyebrow">Payments</p>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-[-0.04em] sm:text-6xl">
              Activate real payments.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
              CostMyAI uses Lovable&apos;s built-in Stripe integration. The go-live flow happens in
              Stripe, but it is started from the Lovable Payments tab. Follow the steps below and
              never guess a Stripe URL again.
            </p>
          </Reveal>

          <Reveal delay={150} className="mt-14">
            <div className="flex flex-col gap-6 border-y border-border py-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="eyebrow">Sandbox account</p>
                <p className="mt-1 font-mono text-sm">{SANDBOX_ACCOUNT_ID}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  The test account Lovable provisioned for this project.
                </p>
              </div>
              <button
                type="button"
                onClick={copyAccountId}
                className="inline-flex items-center gap-2 self-start rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
              >
                {copied ? <CheckCircle2 className="size-4 text-saving" /> : <Copy className="size-4" />}
                {copied ? "Copied" : "Copy account ID"}
              </button>
            </div>
          </Reveal>

          <Reveal delay={250} className="mt-16">
            <h2 className="text-2xl font-semibold tracking-tight">Go-live checklist</h2>
            <p className="mt-2 text-muted-foreground">
              Each step unlocks the next. Current status: <strong>claim account</strong>.
            </p>

            <div className="mt-10 space-y-0 divide-y divide-border border-y border-border">
              {STEPS.map((step, index) => (
                <StepRow key={step.id} step={step} index={index + 1} />
              ))}
            </div>
          </Reveal>

          <Reveal delay={350} className="mt-16">
            <div className="rounded-2xl bg-primary-soft p-6 sm:p-8">
              <div className="flex items-start gap-4">
                <ShieldCheck className="mt-0.5 size-6 shrink-0 text-primary" />
                <div>
                  <h3 className="text-lg font-semibold tracking-tight">What happens after go-live?</h3>
                  <p className="mt-2 text-muted-foreground">
                    Once the readiness check passes, paid levels (Certify, Rightsize, Govern) can
                    charge real cards. The project automatically switches from test-mode products
                    and webhooks to the live environment.
                  </p>
                  <Link
                    to="/billing"
                    className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary"
                  >
                    Go to workspace billing
                    <ExternalLink className="size-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </MarketingShell>
  );
}

function StepRow({
  step,
  index,
}: {
  step: {
    id: string;
    title: string;
    status: "in_progress" | "not_started";
    action: string;
    detail: string;
  };
  index: number;
}) {
  const isActive = step.status === "in_progress";

  return (
    <div className="group py-7 sm:py-8">
      <div className="flex items-start gap-4 sm:gap-6">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
            isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          }`}
        >
          <span className="num">{index}</span>
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-lg font-semibold tracking-tight">{step.title}</h3>
            {isActive ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-opportunity-soft px-2.5 py-1 text-xs font-semibold text-opportunity">
                <Loader2 className="size-3 animate-spin" />
                In progress
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-muted-foreground">{step.detail}</p>
          <p className="mt-3 text-sm font-medium text-foreground">{step.action}</p>
        </div>
      </div>
    </div>
  );
}
