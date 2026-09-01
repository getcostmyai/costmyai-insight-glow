/**
 * Newsletter issue composition and sending.
 *
 * Two rules shape everything here.
 *
 * Nothing auto-sends. There is no cron entry, no scheduler and no
 * "publish on save": every real send is the direct consequence of an admin
 * clicking a button twice, having been shown the exact recipient count first.
 *
 * A send is idempotent per recipient. `newsletter_sends` carries a
 * UNIQUE (issue_id, subscriber_id), and the recipient list for a run is
 * computed as "confirmed subscribers minus everyone already recorded as sent
 * for this issue". A run that dies halfway through can therefore be retried
 * safely: the people who received the issue are skipped, and only the failures
 * are attempted again. The provider-side idempotency key is a second belt on
 * the same trousers, covering the window between "mail accepted" and "row
 * written".
 */

export interface IssueSummary {
  id: string;
  title: string;
  status: "draft" | "sent";
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  sentCount: number;
  failedCount: number;
}

export interface IssueDetail extends IssueSummary {
  markdownBody: string;
}

export interface SendReport {
  /** Confirmed subscribers at the moment the run started. */
  confirmed: number;
  /** Already recorded as sent for this issue before the run. */
  skipped: number;
  attempted: number;
  sent: number;
  failed: number;
}

/** How many recipients are in flight at once. Small enough to stay well inside
 * the provider's rate limits, large enough that a real list does not crawl. */
const BATCH_SIZE = 20;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function sendCounts(rows: Array<{ issue_id: string; status: string }>) {
  const counts = new Map<string, { sent: number; failed: number }>();
  for (const row of rows) {
    const entry = counts.get(row.issue_id) ?? { sent: 0, failed: 0 };
    if (row.status === "sent") entry.sent += 1;
    else entry.failed += 1;
    counts.set(row.issue_id, entry);
  }
  return counts;
}

export async function listIssues(): Promise<IssueSummary[]> {
  const db = await admin();
  const { data, error } = await db
    .from("newsletter_issues")
    .select("id, title, status, created_at, updated_at, sent_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;

  const { data: sends, error: sendError } = await db
    .from("newsletter_sends")
    .select("issue_id, status");
  if (sendError) throw sendError;
  const counts = sendCounts((sends ?? []) as Array<{ issue_id: string; status: string }>);

  return (data ?? []).map((row) => {
    const c = counts.get(String(row.id)) ?? { sent: 0, failed: 0 };
    return {
      id: String(row.id),
      title: String(row.title),
      status: row.status === "sent" ? "sent" : "draft",
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      sentAt: row.sent_at ? String(row.sent_at) : null,
      sentCount: c.sent,
      failedCount: c.failed,
    };
  });
}

export async function getIssue(id: string): Promise<IssueDetail | null> {
  const db = await admin();
  const { data, error } = await db
    .from("newsletter_issues")
    .select("id, title, markdown_body, status, created_at, updated_at, sent_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const { data: sends, error: sendError } = await db
    .from("newsletter_sends")
    .select("issue_id, status")
    .eq("issue_id", id);
  if (sendError) throw sendError;
  const c = sendCounts((sends ?? []) as Array<{ issue_id: string; status: string }>).get(id) ?? {
    sent: 0,
    failed: 0,
  };

  return {
    id: String(data.id),
    title: String(data.title),
    markdownBody: String(data.markdown_body),
    status: data.status === "sent" ? "sent" : "draft",
    createdAt: String(data.created_at),
    updatedAt: String(data.updated_at),
    sentAt: data.sent_at ? String(data.sent_at) : null,
    sentCount: c.sent,
    failedCount: c.failed,
  };
}

export async function saveIssue(input: {
  id?: string | null;
  title: string;
  markdownBody: string;
  authorId: string;
}): Promise<{ id: string }> {
  const db = await admin();

  if (input.id) {
    // A sent issue is a historical record. Editing it would make the archive
    // disagree with what landed in people's inboxes.
    const { data: existing, error: readError } = await db
      .from("newsletter_issues")
      .select("status")
      .eq("id", input.id)
      .maybeSingle();
    if (readError) throw readError;
    if (!existing) throw new Error("Issue not found");
    if (existing.status === "sent") throw new Error("A sent issue can no longer be edited");

    const { error } = await db
      .from("newsletter_issues")
      .update({ title: input.title, markdown_body: input.markdownBody })
      .eq("id", input.id);
    if (error) throw error;
    return { id: input.id };
  }

  const { data, error } = await db
    .from("newsletter_issues")
    .insert({
      title: input.title,
      markdown_body: input.markdownBody,
      status: "draft",
      created_by: input.authorId,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: String(data.id) };
}

/**
 * The number shown on the confirmation step, and the number used to build the
 * recipient list. One query, one definition — a count that came from anywhere
 * else would be a promise the send does not keep.
 */
export async function confirmedSubscriberCount(): Promise<number> {
  const db = await admin();
  const { count, error } = await db
    .from("newsletter_subscribers")
    .select("id", { count: "exact", head: true })
    .eq("status", "confirmed")
    .eq("is_synthetic", false);
  if (error) throw error;
  return count ?? 0;
}

async function confirmedSubscribers(): Promise<
  Array<{ id: string; email: string; confirm_token: string | null }>
> {
  const db = await admin();
  const { data, error } = await db
    .from("newsletter_subscribers")
    .select("id, email, confirm_token")
    .eq("status", "confirmed")
    .eq("is_synthetic", false)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Array<{ id: string; email: string; confirm_token: string | null }>;
}

async function origin(): Promise<string> {
  const { siteOrigin } = await import("../partner-welcome.server");
  return siteOrigin();
}

/** Render the real email template to HTML, for the composer preview. */
export async function renderIssueHtml(input: {
  title: string;
  markdownBody: string;
}): Promise<string> {
  const React = (await import("react")).default;
  const { render } = await import("@react-email/render");
  const { template } = await import("../email-templates/newsletter-issue");
  const base = await origin();
  return render(
    React.createElement(template.component, {
      title: input.title,
      markdownBody: input.markdownBody,
      unsubscribeUrl: `${base}/newsletter/unsubscribe?token=preview`,
      archiveUrl: `${base}/intelligence`,
    }),
  );
}

/**
 * Send one copy to a single address, with no `newsletter_sends` row written.
 * A test send is a rehearsal, not a delivery: recording it would let a
 * subsequent real send skip that subscriber.
 */
export async function sendTestIssue(input: {
  issueId: string;
  toEmail: string;
}): Promise<{ sent: boolean }> {
  const issue = await getIssue(input.issueId);
  if (!issue) throw new Error("Issue not found");

  const base = await origin();
  const { sendTemplateEmail } = await import("../email-templates/send-email");
  const result = await sendTemplateEmail("newsletter-issue", input.toEmail, {
    templateData: {
      title: `[TEST] ${issue.title}`,
      markdownBody: issue.markdownBody,
      unsubscribeUrl: `${base}/newsletter/unsubscribe?token=test`,
      archiveUrl: `${base}/intelligence`,
    },
    // Distinct per click, so an editor can iterate and actually see each version.
    idempotencyKey: `newsletter-test-${input.issueId}-${Date.now()}`,
  });
  return { sent: result.sent };
}

export async function sendIssueToAll(issueId: string): Promise<SendReport> {
  const db = await admin();
  const issue = await getIssue(issueId);
  if (!issue) throw new Error("Issue not found");

  const recipients = await confirmedSubscribers();

  // Already delivered for this issue. Only 'sent' counts as done — a row left
  // at 'failed' is exactly what a retry exists to clear.
  const { data: doneRows, error: doneError } = await db
    .from("newsletter_sends")
    .select("subscriber_id, status")
    .eq("issue_id", issueId)
    .eq("status", "sent");
  if (doneError) throw doneError;
  const done = new Set((doneRows ?? []).map((r) => String(r.subscriber_id)));

  const pending = recipients.filter((r) => !done.has(String(r.id)));

  const base = await origin();
  // Bulk issue delivery uses Brevo. Confirmation emails and test sends stay on
  // Lovable's transactional service, which is the correct channel for those.
  const { sendBrevoNewsletter } = await import("./brevo-send.server");

  const report: SendReport = {
    confirmed: recipients.length,
    skipped: recipients.length - pending.length,
    attempted: pending.length,
    sent: 0,
    failed: 0,
  };

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (subscriber) => {
        try {
          const outcome = await sendBrevoNewsletter(subscriber.email, {
            title: issue.title,
            markdownBody: issue.markdownBody,
            unsubscribeUrl: subscriber.confirm_token
              ? `${base}/newsletter/unsubscribe?token=${subscriber.confirm_token}`
              : `${base}/newsletter/unsubscribe`,
            archiveUrl: `${base}/intelligence`,
            // Stable across retries: if a run died after the provider accepted
            // the mail but before the row was written, the retry does not
            // deliver a second copy.
            idempotencyKey: `newsletter-issue-${issueId}-${subscriber.id}`,
          });
          // A suppressed recipient is a settled outcome, not a failure to retry.
          return { id: String(subscriber.id), status: "sent" as const, ok: outcome.sent };
        } catch (err) {
          console.error(
            "newsletter issue send failed",
            issueId,
            err instanceof Error ? err.message : String(err),
          );
          return { id: String(subscriber.id), status: "failed" as const, ok: false };
        }
      }),
    );

    for (const r of results) {
      if (r.status === "sent") report.sent += 1;
      else report.failed += 1;
    }

    const { error: writeError } = await db.from("newsletter_sends").upsert(
      results.map((r) => ({
        issue_id: issueId,
        subscriber_id: r.id,
        status: r.status,
        // Pinned false by pin_synthetic_false(); stated for the guarded-insert
        // lint rule and for the reader.
        is_synthetic: false,
      })),
      { onConflict: "issue_id,subscriber_id" },
    );
    if (writeError) throw writeError;
  }

  // The issue is marked sent once every confirmed subscriber has a 'sent' row.
  // A partial run stays a draft, which is what keeps the retry button honest.
  if (report.failed === 0 && report.skipped + report.sent === recipients.length) {
    const { error } = await db
      .from("newsletter_issues")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", issueId);
    if (error) throw error;
  }

  return report;
}
