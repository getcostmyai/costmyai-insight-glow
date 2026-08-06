import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  Loader2,
  PlayCircle,
} from "lucide-react";

import { MarketingShell } from "@/components/marketing/MarketingShell";
import { BOOK_DEMO_URL } from "@/lib/marketing-links";
import { partnerLadderQuery } from "@/lib/partner-tiers.functions";
import { formatRate, formatRateRange, formatThreshold } from "@/lib/partner-tiers";
import { submitPartnerApplication } from "@/lib/partner-application.functions";
import {
  ACTIVE_CLIENT_BUCKETS,
  REVIEW_TURNAROUND,
  STARTING_SOON_BUCKETS,
  routeApplication,
  validateContact,
  type ActiveClientBucket,
  type ApplicantContact,
  type FieldErrors,
  type StartingSoonBucket,
} from "@/lib/partner-application";

export const Route = createFileRoute("/partners_/apply")({
  loader: ({ context }) => context.queryClient.ensureQueryData(partnerLadderQuery()),
  head: () => ({
    meta: [
      { title: "Apply to the CostMyAI partner program" },
      {
        name: "description",
        content:
          "Tell us about your client practice and we'll take it from there. Every partner application is reviewed by a person — larger practices go straight to a call.",
      },
      { property: "og:title", content: "Apply to the CostMyAI partner program" },
      {
        property: "og:description",
        content: "Two questions, your details, and a real human review — no automated approvals.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ApplyPage,
});

const EMPTY: ApplicantContact = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  company: "",
};

type Stage = 1 | 2 | 3 | "done";

function ApplyPage() {
  const { data: ladder } = useSuspenseQuery(partnerLadderQuery());
  const submit = useServerFn(submitPartnerApplication);

  const [stage, setStage] = useState<Stage>(1);
  const [activeClients, setActiveClients] = useState<ActiveClientBucket | null>(null);
  const [startingSoon, setStartingSoon] = useState<StartingSoonBucket | null>(null);
  const [contact, setContact] = useState<ApplicantContact>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ path: "meeting" | "async"; escalated: boolean } | null>(
    null,
  );

  const routing = useMemo(
    () => (activeClients && startingSoon ? routeApplication(activeClients, startingSoon) : null),
    [activeClients, startingSoon],
  );

  async function send() {
    if (!activeClients || !startingSoon) return;
    const found = validateContact(contact);
    setErrors(found);
    if (Object.keys(found).length) return;

    setSubmitting(true);
    setFailure(null);
    try {
      const result = await submit({ data: { ...contact, activeClients, startingSoon } });
      setOutcome({ path: result.path, escalated: result.escalated });
      setStage("done");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setFailure(
        error instanceof Error ? error.message : "We could not save that — please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <MarketingShell>
      <section className="px-5 pb-20 pt-14 sm:px-8 sm:pt-20">
        <div className="mx-auto max-w-2xl">
          <Link
            to="/partners"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Partner program
          </Link>

          {stage !== "done" && (
            <>
              <h1 className="mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">
                Apply to become a Partner
              </h1>
              <p className="mt-3 text-muted-foreground">
                Two questions about your practice, then your details. We talk to every partner
                before onboarding — nothing here approves itself.
              </p>
              <Steps stage={stage} />
            </>
          )}

          {stage === 1 && (
            <Card>
              <Question
                title="How many active clients do you currently serve?"
                hint="Active = clients you have invoiced at least once in the last 6 months."
              />
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {ACTIVE_CLIENT_BUCKETS.map((bucket) => (
                  <Choice
                    key={bucket}
                    label={bucket}
                    selected={activeClients === bucket}
                    onSelect={() => {
                      setActiveClients(bucket);
                      setStage(2);
                    }}
                  />
                ))}
              </div>
            </Card>
          )}

          {stage === 2 && (
            <Card>
              <Question
                title="How many of your clients would likely start in the next 3 weeks?"
                hint="A rough number is fine — we use it to decide whether we should just talk directly."
              />
              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {STARTING_SOON_BUCKETS.map((bucket) => (
                  <Choice
                    key={bucket}
                    label={bucket}
                    selected={startingSoon === bucket}
                    onSelect={() => {
                      setStartingSoon(bucket);
                      setStage(3);
                    }}
                  />
                ))}
              </div>
              <BackButton onClick={() => setStage(1)} />
            </Card>
          )}

          {stage === 3 && (
            <Card>
              <h2 className="text-lg font-semibold">Your details</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {routing?.path === "meeting"
                  ? "We'll save your application and put a meeting slot in front of you on the next screen."
                  : `We'll save your application to the review queue — a person reads every one, and you'll hear back within ${REVIEW_TURNAROUND}.`}
              </p>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <Field
                  id="firstName"
                  label="First name"
                  value={contact.firstName}
                  error={errors.firstName}
                  autoComplete="given-name"
                  onChange={(v) => setContact({ ...contact, firstName: v })}
                />
                <Field
                  id="lastName"
                  label="Last name"
                  value={contact.lastName}
                  error={errors.lastName}
                  autoComplete="family-name"
                  onChange={(v) => setContact({ ...contact, lastName: v })}
                />
                <Field
                  id="email"
                  label="Business email"
                  type="email"
                  value={contact.email}
                  error={errors.email}
                  autoComplete="email"
                  onChange={(v) => setContact({ ...contact, email: v })}
                />
                <Field
                  id="phone"
                  label="Phone number"
                  type="tel"
                  value={contact.phone}
                  error={errors.phone}
                  autoComplete="tel"
                  onChange={(v) => setContact({ ...contact, phone: v })}
                />
                <div className="sm:col-span-2">
                  <Field
                    id="company"
                    label="Company name"
                    value={contact.company}
                    error={errors.company}
                    autoComplete="organization"
                    onChange={(v) => setContact({ ...contact, company: v })}
                  />
                </div>
              </div>

              {failure && (
                <p className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {failure}
                </p>
              )}

              <div className="mt-6 flex items-center justify-between gap-3">
                <BackButton onClick={() => setStage(2)} inline />
                <button
                  type="button"
                  onClick={send}
                  disabled={submitting}
                  className="btn-gradient inline-flex items-center gap-2 px-5 py-2.5 text-sm disabled:opacity-60"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {routing?.path === "meeting" ? "Continue to booking" : "Submit application"}
                </button>
              </div>
            </Card>
          )}

          {stage === "done" && outcome?.path === "meeting" && (
            <Card>
              <CalendarCheck className="h-6 w-6 text-primary" />
              <h1 className="mt-4 text-2xl font-semibold tracking-tight">
                Your application is saved — now pick a time
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {outcome.escalated
                  ? "You have real clients ready to start in the next few weeks, so we'd rather talk than queue you."
                  : "A practice your size gets a direct conversation rather than a queue."}{" "}
                We already have your details, so if the calendar isn't convenient right now we'll
                still reach out.
              </p>
              <a
                href={BOOK_DEMO_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="btn-gradient mt-6 inline-flex items-center gap-2 px-5 py-2.5 text-sm"
              >
                Book your partner call
                <ArrowRight className="h-4 w-4" />
              </a>
            </Card>
          )}

          {stage === "done" && outcome?.path === "async" && (
            <div className="mt-6 space-y-4">
              <Card>
                <CheckCircle2 className="h-6 w-6 text-primary" />
                <h1 className="mt-4 text-2xl font-semibold tracking-tight">
                  You're in the review queue
                </h1>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  We review every application personally — in batches, by a real person, not by an
                  automatic rule. You'll hear from us within {REVIEW_TURNAROUND}. Nothing is approved
                  or rejected in the meantime.
                </p>
              </Card>

              <Card>
                <h2 className="text-sm font-semibold">Walkthrough of the partner program</h2>
                <div className="mt-4 flex items-center gap-4 rounded-xl border border-dashed border-border bg-muted/40 px-5 py-6">
                  <PlayCircle className="h-8 w-8 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Recording coming soon</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      A short walkthrough of how the program works is being recorded. We won't put a
                      placeholder video here pretending otherwise — everything it will cover is
                      written out below.
                    </p>
                  </div>
                </div>
              </Card>

              <Card>
                <h2 className="text-sm font-semibold">While you wait — how the program actually works</h2>
                <dl className="mt-4 space-y-4 text-sm">
                  <Faq q="What do I earn?">
                    {formatRateRange(ladder)
                      ? `${formatRateRange(ladder)} of what your referrals pay, set by your lifetime referred revenue. The levels today: ${ladder.tiers
                          .map((t) => `${t.name} ${formatRate(t.ratePct)} from ${formatThreshold(t.minLifetimeUsd)}`)
                          .join(", ")}.`
                      : "The commission ladder is published on the partner page and read straight from our payout table."}
                  </Faq>
                  <Faq q="How long does commission last?">
                    For the lifetime of the account. Once a workspace is attached to your code it
                    stays attributed to you, with no reset at renewal.
                  </Faq>
                  <Faq q="How does attribution work?">
                    A click on your link is remembered for 60 days; a workspace created in that
                    window is attached to you, and the code can also be entered by hand by the
                    workspace owner. Attribution is frozen at that point and cannot be moved to
                    another partner afterwards. If the 60 days lapse before signup, it takes a fresh
                    click or the code entered manually.
                  </Faq>
                  <Faq q="When is commission actually written?">
                    Only when a real invoice is paid. Nothing is estimated in advance, and your
                    ledger shows one line per paid invoice at the rate you were on.
                  </Faq>
                </dl>
                <Link
                  to="/partners"
                  className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-primary"
                >
                  Back to the partner program
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Card>
            </div>
          )}
        </div>
      </section>
    </MarketingShell>
  );
}

function Steps({ stage }: { stage: Stage }) {
  const labels = ["Your practice", "Pipeline", "Details"];
  const current = stage === "done" ? 4 : stage;
  return (
    <ol className="mt-8 flex items-center gap-2 text-xs">
      {labels.map((label, i) => {
        const n = i + 1;
        const active = current === n;
        const done = current > n;
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={`num flex h-6 w-6 shrink-0 items-center justify-center rounded-full tabular-nums ${
                active
                  ? "bg-primary text-primary-foreground"
                  : done
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {n}
            </span>
            <span className={active ? "font-medium" : "text-muted-foreground"}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="mt-6 rounded-2xl border border-border bg-card p-6 sm:p-8">{children}</div>;
}

function Question({ title, hint }: { title: string; hint: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

function Choice({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`num rounded-xl border px-4 py-3 text-sm font-medium tabular-nums transition-colors ${
        selected
          ? "border-primary bg-primary/10 text-primary"
          : "border-border hover:border-primary/50 hover:bg-muted"
      }`}
    >
      {label}
    </button>
  );
}

function BackButton({ onClick, inline }: { onClick: () => void; inline?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground ${
        inline ? "" : "mt-6"
      }`}
    >
      <ArrowLeft className="h-4 w-4" />
      Back
    </button>
  );
}

function Field({
  id,
  label,
  value,
  error,
  onChange,
  type = "text",
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1.5 w-full rounded-xl border bg-background px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-primary ${
          error ? "border-destructive" : "border-border"
        }`}
      />
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-medium">{q}</dt>
      <dd className="mt-1 leading-relaxed text-muted-foreground">{children}</dd>
    </div>
  );
}
