import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CalendarCheck, ClipboardList, Loader2, Mail, Phone } from "lucide-react";

import {
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
        <span className="num tabular-nums">{rows.filter((r) => r.status === "pending").length}</span>{" "}
        pending of <span className="num tabular-nums">{rows.length}</span>.
      </p>

      {rows.length === 0 ? (
        <p className="mt-10 text-sm text-muted-foreground">No applications yet.</p>
      ) : (
        <div className="mt-8 space-y-3">
          {rows.map((r) => (
            <ApplicationRow
              key={r.id}
              row={r}
              onChanged={() => queryClient.invalidateQueries({ queryKey: ["partner-applications"] })}
            />
          ))}
        </div>
      )}
    </Shell>
  );
}

type Row = Awaited<ReturnType<typeof listPartnerApplications>>[number];

function ApplicationRow({ row, onChanged }: { row: Row; onChanged: () => void }) {
  const setStatus = useServerFn(setPartnerApplicationStatus);
  const [note, setNote] = useState(row.reviewerNote ?? "");
  const [busy, setBusy] = useState<ApplicationStatus | null>(null);

  async function apply(status: ApplicationStatus) {
    setBusy(status);
    try {
      await setStatus({ data: { id: row.id, status, note } });
      onChanged();
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
      </div>
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
