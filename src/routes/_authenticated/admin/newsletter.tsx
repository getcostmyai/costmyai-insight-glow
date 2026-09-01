import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Loader2, Mail, Plus, RefreshCw, Send, Users } from "lucide-react";

import {
  getNewsletterIssue,
  listNewsletterIssues,
  previewNewsletterIssue,
  saveNewsletterIssue,
  sendNewsletterIssue,
  sendNewsletterTest,
} from "@/lib/newsletter/issues.functions";
import type { IssueSummary, SendReport } from "@/lib/newsletter/issues.server";

export const Route = createFileRoute("/_authenticated/admin/newsletter")({
  head: () => ({
    meta: [
      { title: "Newsletter composer — CostMyAI internal" },
      {
        name: "description",
        content: "Write, preview and send the weekly AI spend briefing to confirmed subscribers.",
      },
      { property: "og:title", content: "Newsletter composer" },
      { property: "og:description", content: "Internal newsletter composer." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NewsletterAdminPage,
});

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

function NewsletterAdminPage() {
  const read = useServerFn(listNewsletterIssues);
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["newsletter-issues"],
    queryFn: () => read({ data: undefined }),
    retry: false,
  });

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Mail className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-[0.14em]">Internal</span>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Newsletter composer</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Nothing here sends on a schedule. Every issue leaves because someone clicked twice,
            after seeing the exact number of people it goes to.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refetch()}
            className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setCreating(true);
            }}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" />
            New issue
          </button>
        </div>
      </header>

      <div className="mb-8 inline-flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3">
        <Users className="h-4 w-4 text-primary" />
        <span className="text-sm">
          <span className="font-semibold">{data?.confirmed ?? "—"}</span>{" "}
          <span className="text-muted-foreground">confirmed subscribers</span>
        </span>
      </div>

      {creating || editing ? (
        <IssueEditor
          issueId={editing}
          confirmed={data?.confirmed ?? 0}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      ) : null}

      <section className="mt-10">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Issues
        </h2>
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : error ? (
          <p className="text-sm text-destructive">{(error as Error).message}</p>
        ) : (data?.issues ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No issues written yet.</p>
        ) : (
          <div className="divide-y divide-border border-y border-border">
            {(data?.issues ?? []).map((issue) => (
              <IssueRow
                key={issue.id}
                issue={issue}
                onOpen={() => {
                  setCreating(false);
                  setEditing(issue.id);
                }}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function IssueRow({ issue, onOpen }: { issue: IssueSummary; onOpen: () => void }) {
  return (
    <article className="flex flex-wrap items-center justify-between gap-3 py-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ${
              issue.status === "sent"
                ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20"
                : "bg-muted text-muted-foreground ring-border"
            }`}
          >
            {issue.status}
          </span>
          <h3 className="truncate text-sm font-semibold">{issue.title}</h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Updated {when(issue.updatedAt)}
          {issue.sentAt ? ` · sent ${when(issue.sentAt)}` : ""}
          {issue.sentCount ? ` · ${issue.sentCount} delivered` : ""}
          {issue.failedCount ? ` · ${issue.failedCount} failed` : ""}
        </p>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
      >
        {issue.status === "sent" ? "Review" : "Edit"}
      </button>
    </article>
  );
}

function IssueEditor({
  issueId,
  confirmed,
  onClose,
}: {
  issueId: string | null;
  confirmed: number;
  onClose: () => void;
}) {
  const load = useServerFn(getNewsletterIssue);
  const save = useServerFn(saveNewsletterIssue);
  const preview = useServerFn(previewNewsletterIssue);
  const test = useServerFn(sendNewsletterTest);
  const sendAll = useServerFn(sendNewsletterIssue);
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [savedId, setSavedId] = useState<string | null>(issueId);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const [report, setReport] = useState<SendReport | null>(null);

  const existing = useQuery({
    queryKey: ["newsletter-issue", issueId],
    queryFn: () => load({ data: { id: issueId! } }),
    enabled: Boolean(issueId),
    retry: false,
  });

  useEffect(() => {
    if (existing.data) {
      setTitle(existing.data.title);
      setBody(existing.data.markdownBody);
      setSavedId(existing.data.id);
    }
  }, [existing.data]);

  const locked = existing.data?.status === "sent";

  // The preview is the real email template rendered on the server, so what is
  // reviewed here is byte-for-byte what subscribers receive.
  const previewQuery = useQuery({
    queryKey: ["newsletter-preview", title, body],
    queryFn: () => preview({ data: { title, markdownBody: body } }),
    enabled: body.trim().length > 0,
    retry: false,
    staleTime: 30_000,
  });

  const saveMutation = useMutation({
    mutationFn: () => save({ data: { id: savedId, title, markdownBody: body } }),
    onSuccess: (result) => {
      setSavedId(result.id);
      setNotice("Draft saved.");
      setFailure(null);
      void queryClient.invalidateQueries({ queryKey: ["newsletter-issues"] });
    },
    onError: (err: Error) => setFailure(err.message),
  });

  const testMutation = useMutation({
    mutationFn: () => test({ data: { id: savedId! } }),
    onSuccess: (result) =>
      setNotice(result.sent ? `Test sent to ${result.to}.` : `${result.to} is suppressed, nothing sent.`),
    onError: (err: Error) => setFailure(err.message),
  });

  const sendMutation = useMutation({
    mutationFn: () => sendAll({ data: { id: savedId!, confirmCount: confirmed } }),
    onSuccess: (result) => {
      setReport(result);
      setArmed(false);
      setFailure(null);
      void queryClient.invalidateQueries({ queryKey: ["newsletter-issues"] });
      void queryClient.invalidateQueries({ queryKey: ["newsletter-issue", savedId] });
    },
    onError: (err: Error) => {
      setArmed(false);
      setFailure(err.message);
    },
  });

  const dirty = useMemo(
    () => title !== (existing.data?.title ?? "") || body !== (existing.data?.markdownBody ?? ""),
    [title, body, existing.data],
  );

  const busy =
    saveMutation.isPending || testMutation.isPending || sendMutation.isPending;

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{issueId ? "Edit issue" : "New issue"}</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-muted-foreground underline hover:text-foreground"
        >
          Close
        </button>
      </div>

      {locked ? (
        <p className="mt-3 rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground">
          This issue has been sent. It is kept read-only so the archive matches what landed in
          people's inboxes.
        </p>
      ) : null}

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        readOnly={locked}
        placeholder="Issue title (this becomes the subject line)"
        maxLength={160}
        className="mt-4 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
      />

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Markdown
          </p>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            readOnly={locked}
            rows={22}
            placeholder={"## What moved in the last 7 days\n\nA paragraph.\n\n- A bullet\n- Another bullet\n\n> A pull quote.\n\n::chart kind=bars title=\"Biggest cuts, last 7 days\" data=\"GPT-5.1:-40|Claude cache:-12\"\n"}
            className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2 font-mono text-xs leading-relaxed outline-none focus:border-primary"
          />
          <div className="mt-2 space-y-1 text-[11px] leading-relaxed text-muted-foreground">
            <p>
              Charts are one line each. The numbers live in the line, so a sent issue renders the
              same picture forever.
            </p>
            <p>
              <code>::chart kind=bars data="Label:-40|Label:-12"</code> percentages
            </p>
            <p>
              <code>::chart kind=spread data="DeepSeek V3.2:0.234:3.375"</code> cheapest to dearest
            </p>
            <p>
              <code>::chart kind=scatter data="Claude Opus 5:89.1:10|GLM-5.3-Flash:84.3:0.1188"</code>{" "}
              score then blended price
            </p>
            <p>Optional on any of them: <code>title="…"</code> and <code>note="…"</code>.</p>
          </div>

        </div>
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Preview (the email itself)
          </p>
          <div className="h-[34rem] overflow-hidden rounded-xl border border-border bg-white">
            {previewQuery.isFetching ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : previewQuery.data?.html ? (
              <iframe
                title="Newsletter preview"
                srcDoc={previewQuery.data.html}
                sandbox=""
                className="h-full w-full"
              />
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center text-xs text-muted-foreground">
                Start writing and the real email renders here.
              </div>
            )}
          </div>
        </div>
      </div>

      {notice ? (
        <p className="mt-4 rounded-xl border border-primary/40 bg-primary/5 px-3 py-2 text-xs text-primary">
          {notice}
        </p>
      ) : null}
      {failure ? (
        <p className="mt-4 rounded-xl border border-destructive/40 px-3 py-2 text-xs text-destructive">
          {failure}
        </p>
      ) : null}
      {report ? (
        <p className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700">
          {report.sent} delivered, {report.failed} failed, {report.skipped} already had this issue,
          out of {report.confirmed} confirmed subscribers.
          {report.failed > 0
            ? " Press send again to retry only the failures. Nobody already delivered to is contacted twice."
            : ""}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {!locked ? (
          <button
            type="button"
            disabled={busy || title.trim().length < 3 || body.trim().length === 0}
            onClick={() => saveMutation.mutate()}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Save draft
          </button>
        ) : null}

        <button
          type="button"
          disabled={busy || !savedId || dirty}
          onClick={() => testMutation.mutate()}
          className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-medium text-muted-foreground transition hover:text-foreground disabled:opacity-50"
        >
          {testMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Mail className="h-3.5 w-3.5" />
          )}
          Send test to myself
        </button>

        {!locked ? (
          armed ? (
            <div className="flex flex-wrap items-center gap-2 rounded-full border border-destructive/50 bg-destructive/5 px-3 py-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
              <span className="text-xs text-destructive">
                Send "{title}" to {confirmed} confirmed subscriber{confirmed === 1 ? "" : "s"}?
              </span>
              <button
                type="button"
                disabled={sendMutation.isPending}
                onClick={() => sendMutation.mutate()}
                className="inline-flex items-center gap-1.5 rounded-full bg-destructive px-3 py-1 text-xs font-semibold text-destructive-foreground disabled:opacity-60"
              >
                {sendMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Send className="h-3 w-3" />
                )}
                Yes, send now
              </button>
              <button
                type="button"
                onClick={() => setArmed(false)}
                className="text-xs text-muted-foreground underline"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={busy || !savedId || dirty || confirmed === 0}
              onClick={() => {
                setReport(null);
                setArmed(true);
              }}
              className="inline-flex items-center gap-2 rounded-full border border-destructive/50 px-4 py-2 text-xs font-semibold text-destructive transition hover:bg-destructive/5 disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              Send to all confirmed subscribers
            </button>
          )
        ) : null}
      </div>

      {dirty && savedId ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Unsaved changes. Save the draft before sending anything.
        </p>
      ) : null}
    </section>
  );
}
