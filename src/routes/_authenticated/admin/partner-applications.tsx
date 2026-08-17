import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  CalendarCheck,
  ClipboardList,
  Loader2,
  Mail,
  Phone,
  UserPlus,
} from "lucide-react";

import { createPartner } from "@/lib/partner-create.functions";
import {
  approveAndProvisionPartner,
  listPartnerApplications,
  setPartnerApplicationStatus,
} from "@/lib/partner-application.functions";

import { APPLICATION_STATUSES, type ApplicationStatus } from "@/lib/partner-application";

export const Route = createFileRoute("/_authenticated/admin/partner-applications")({
  head: () => ({
    meta: [
      { title: "Partner applications — review queue" },
      { name: "description", content: "Internal review queue for partner program applications." },
      { property: "og:title", content: "Partner applications" },
      { property: "og:description", content: "Internal review queue." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReviewQueue,
});

function ReviewQueue() {
  const fetchAll = useServerFn(listPartnerApplications);
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["partner-applications"],
    queryFn: () => fetchAll(),
    retry: false,
  });

  if (isLoading) {
    return (
      <Shell>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </Shell>
    );
  }

  // A non-admin sees rows they cannot read — an empty list, not a hint that the
  // queue exists and is being withheld.
  if (error) {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground">Nothing here.</p>
      </Shell>
    );
  }

  const rows = data ?? [];

  return (
    <Shell>
      <div className="flex items-center gap-2">
        <ClipboardList className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight">Partner applications</h1>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Every application a person needs to read.{" "}
        <span className="num tabular-nums">
          {rows.filter((r) => r.status === "pending").length}
        </span>{" "}
        pending of <span className="num tabular-nums">{rows.length}</span>.
      </p>

      <CreatePartnerCard />

      {rows.length === 0 ? (
        <p className="mt-10 text-sm text-muted-foreground">No applications yet.</p>
      ) : (
        <div className="mt-8 space-y-3">
          {rows.map((r) => (
            <ApplicationRow
              key={r.id}
              row={r}
              onChanged={() =>
                queryClient.invalidateQueries({ queryKey: ["partner-applications"] })
              }
            />
          ))}
        </div>
      )}
    </Shell>
  );
}

/**
 * Manual partner creation. This is the supported path for partners we already
 * know: it normalizes the email to the exact string claim_partner_membership()
 * matches on, refuses an empty one, warns before a second active partner reuses
 * an address, and sends the welcome email in the same step.
 */
function CreatePartnerCard() {
  const create = useServerFn(createPartner);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit(allowDuplicate: boolean) {
    setBusy(true);
    setError(null);
    if (!allowDuplicate) setWarning(null);
    try {
      const result = await create({
        data: { name, email, referralCode: code, allowDuplicate },
      });
      if (result.duplicate) {
        setWarning(result.message);
        return;
      }
      setWarning(null);
      setDone(
        `${result.referralCode} created for ${result.email}. ` +
          (result.welcome.sent
            ? "Welcome email sent."
            : `Welcome email not sent: ${result.welcome.reason}`),
      );
      setName("");
      setEmail("");
      setCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the partner.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Create a partner</h2>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-full border border-border px-3.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
        >
          {open ? "Close" : "Open"}
        </button>
      </div>

      {open && (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            The contact email is the exact address the partner must sign up with. Anything else
            will not link to this account.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Partner name"
              className="min-w-[10rem] flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Contact email"
              inputMode="email"
              className="min-w-[12rem] flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Referral code (optional)"
              className="min-w-[10rem] rounded-xl border border-border bg-background px-3 py-2 text-sm uppercase outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={() => submit(false)}
              disabled={busy || !name.trim() || !email.trim()}
              className="rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {busy ? "…" : "Create & send welcome"}
            </button>
          </div>

          {warning && (
            <div className="rounded-xl border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              {warning}
              <button
                type="button"
                onClick={() => submit(true)}
                disabled={busy}
                className="ml-2 rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-background disabled:opacity-60"
              >
                Create anyway
              </button>
            </div>
          )}
          {error && (
            <p className="rounded-xl border border-destructive/40 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}
          {done && (
            <p className="rounded-xl border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              {done}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

type Row = Awaited<ReturnType<typeof listPartnerApplications>>[number];

function ApplicationRow({ row, onChanged }: { row: Row; onChanged: () => void }) {
  const setStatus = useServerFn(setPartnerApplicationStatus);
  const provision = useServerFn(approveAndProvisionPartner);
  const [note, setNote] = useState(row.reviewerNote ?? "");
  const [busy, setBusy] = useState<ApplicationStatus | "provision" | null>(null);
  const [provisioned, setProvisioned] = useState<string | null>(null);
  const [welcomeNote, setWelcomeNote] = useState<string | null>(null);
  const [provisionError, setProvisionError] = useState<string | null>(null);

  async function apply(status: ApplicationStatus) {
    setBusy(status);
    try {
      await setStatus({ data: { id: row.id, status, note } });
      onChanged();
    } finally {
      setBusy(null);
    }
  }

  async function approveAndActivate() {
    setBusy("provision");
    setProvisionError(null);
    try {
      const result = await provision({ data: { id: row.id } });
      setProvisioned(result.referral_code);
      setWelcomeNote(
        result.welcome.sent
          ? `Welcome email sent to ${result.welcome.email}.`
          : `Welcome email not sent: ${result.welcome.reason}`,
      );
      onChanged();
    } catch (err) {
      setProvisionError(err instanceof Error ? err.message : "Could not activate the partner.");
    } finally {
      setBusy(null);
    }
  }


  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">
            {row.firstName} {row.lastName} · {row.company}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" />
              {row.email}
            </span>
            <span className="num inline-flex items-center gap-1.5 tabular-nums">
              <Phone className="h-3.5 w-3.5" />
              {row.phone}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {row.path === "meeting" && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              <CalendarCheck className="h-3.5 w-3.5" />
              {row.escalated ? "Meeting (escalated)" : "Meeting"}
            </span>
          )}
          <StatusBadge status={row.status} />
        </div>
      </div>

      <p className="num mt-3 text-sm tabular-nums text-muted-foreground">
        Active clients: <span className="text-foreground">{row.activeClients}</span> · Starting in 3
        weeks: <span className="text-foreground">{row.startingSoon}</span> ·{" "}
        {new Date(row.createdAt).toLocaleString()}
      </p>

      {!row.notifiedAt && (
        <p className="mt-3 inline-flex items-start gap-2 rounded-xl border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Reviewer alert not delivered{row.notifyError ? `: ${row.notifyError}` : ""}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Reviewer note"
          className="min-w-[12rem] flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        {APPLICATION_STATUSES.filter((s) => s !== row.status).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => apply(s)}
            disabled={busy !== null}
            className="rounded-full border border-border px-3.5 py-2 text-xs font-medium capitalize transition-colors hover:bg-muted disabled:opacity-60"
          >
            {busy === s ? "…" : s}
          </button>
        ))}
        <button
          type="button"
          onClick={approveAndActivate}
          disabled={busy !== null}
          className="rounded-full bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busy === "provision" ? "…" : "Approve & activate partner"}
        </button>
      </div>

      {provisioned && (
        <p className="mt-3 rounded-xl border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          Partner account is live. Referral code{" "}
          <span className="font-semibold text-foreground">{provisioned}</span>. They see it after
          signing in at /partner/login with {row.email}.
          {welcomeNote ? <span className="block mt-1">{welcomeNote}</span> : null}
        </p>
      )}
      {provisionError && (
        <p className="mt-3 rounded-xl border border-destructive/40 px-3 py-2 text-xs text-destructive">
          {provisionError}
        </p>
      )}

    </div>
  );
}

function StatusBadge({ status }: { status: ApplicationStatus }) {
  const tone =
    status === "approved"
      ? "bg-primary/10 text-primary"
      : status === "rejected"
        ? "bg-destructive/10 text-destructive"
        : "bg-muted text-muted-foreground";
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${tone}`}>
      {status}
    </span>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-4xl px-5 py-14 sm:px-8">{children}</div>;
}
