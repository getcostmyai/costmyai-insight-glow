import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import {
  REVIEW_TURNAROUND,
  normalizeContact,
  routeApplication,
  validateContact,
  type ActiveClientBucket,
  type ApplicationInput,
  type ApplicationStatus,
  type StartingSoonBucket,
} from "./partner-application";
import { classifyApplication, type ApplicationVerdict } from "./admin/partner-applications";
import { notifyReviewers } from "./partner-application-notify.server";
import { siteOrigin } from "./partner-welcome.server";

export interface StoredApplication {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  activeClients: string;
  startingSoon: string;
  path: "meeting" | "async";
  escalated: boolean;
  status: ApplicationStatus;
  reviewerNote: string | null;
  createdAt: string;
  notifiedAt: string | null;
  notifyError: string | null;
  reviewerEmailAt: string | null;
  reviewerEmailError: string | null;
  applicantEmailAt: string | null;
  applicantEmailError: string | null;
  verdict: ApplicationVerdict;
}

/**
 * Send one application email without ever letting it break the submission.
 *
 * `sendTemplateEmail` throws on every failure except suppression, and it is
 * reached through a dynamic import so this server-only module never pulls the
 * send helper (and `process.env`) into a client bundle. Both outcomes come back
 * as data and are written to the row, so a mail that never left is visible in
 * the review queue rather than lost.
 */
async function sendApplicationEmail(
  templateName: "partner-application-alert" | "partner-application-received",
  recipient: string,
  applicationId: string,
  templateData: Record<string, unknown>,
): Promise<{ at: string | null; error: string | null }> {
  try {
    const { sendTemplateEmail } = await import("./email-templates/send-email");
    const result = await sendTemplateEmail(templateName, recipient, {
      templateData,
      // Second layer under the "insert branch only" rule: even if this ever ran
      // twice for the same row, Lovable dedupes on the key.
      idempotencyKey: `${templateName}-${applicationId}`,
    });
    if (!result.sent) {
      return {
        at: null,
        error: "This address has bounced, complained or unsubscribed previously",
      };
    }
    return { at: new Date().toISOString(), error: null };
  } catch (err) {
    return { at: null, error: err instanceof Error ? err.message : "Email send failed" };
  }
}

/**
 * The applicant is anonymous, so the row is written with service credentials
 * after the server has re-validated everything. Nothing about the submission
 * grants read access: `partner_applications` holds personal contact details and
 * only a platform admin can ever see it.
 */
export async function submitApplication(input: ApplicationInput) {
  const errors = validateContact(input);
  if (Object.keys(errors).length) {
    throw new Error(Object.values(errors)[0] ?? "Please check your details");
  }
  const contact = normalizeContact(input);
  const routing = routeApplication(input.activeClients, input.startingSoon);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // One live application per business email — a re-submit updates the open one
  // rather than filling the review queue with duplicates of the same person.
  const existing = await supabaseAdmin
    .from("partner_applications")
    .select("id")
    .eq("email", contact.email)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Join the application back to the anonymous visit that produced it, using
  // the same cma_vid cookie the lead_events path reads — read-only, so a
  // visitor without one submits with a null rather than a freshly minted id
  // that never appeared in any event.
  let visitorId: string | null = null;
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { existingVisitorId } = await import("./telemetry/lead-events.server");
    visitorId = existingVisitorId(getRequest());
  } catch {
    visitorId = null;
  }

  const row = {
    visitor_id: visitorId,
    first_name: contact.firstName,
    last_name: contact.lastName,
    email: contact.email,
    phone: contact.phone,
    company: contact.company,
    active_clients_bucket: input.activeClients,
    starting_soon_bucket: input.startingSoon,
    routed_path: routing.path,
    escalated: routing.escalated,
  };

  const isFirstSubmission = !existing.data;

  const saved = existing.data
    ? await supabaseAdmin
        .from("partner_applications")
        .update(row)
        .eq("id", existing.data.id)
        .select("id")
        .single()
    : await supabaseAdmin.from("partner_applications").insert(row).select("id").single();

  if (saved.error) throw saved.error;

  // The three-day promise cannot depend on someone remembering to open a page,
  // so the alert fires here. A failed alert is recorded on the row, never
  // swallowed and never allowed to lose the application itself.
  const alert = await notifyReviewers({
    id: saved.data.id,
    name: `${contact.firstName} ${contact.lastName}`,
    email: contact.email,
    phone: contact.phone,
    company: contact.company,
    activeClients: input.activeClients,
    startingSoon: input.startingSoon,
    path: routing.path,
    escalated: routing.escalated,
  });

  // Email is first-submission only. A re-submit is the same person correcting
  // the same open application: the reviewer channel should still hear about it
  // (the webhook above fires every time), but neither we nor the applicant
  // should get a second "new application" / "we have your application" mail for
  // a row that already exists.
  const emails = isFirstSubmission
    ? await Promise.all([
        sendApplicationEmail("partner-application-alert", "", saved.data.id, {
          applicationId: saved.data.id,
          name: `${contact.firstName} ${contact.lastName}`,
          email: contact.email,
          phone: contact.phone,
          company: contact.company,
          activeClients: input.activeClients,
          startingSoon: input.startingSoon,
          path: routing.path,
          escalated: routing.escalated,
          reviewUrl: `${siteOrigin()}/admin/partner-applications`,
        }),
        sendApplicationEmail("partner-application-received", contact.email, saved.data.id, {
          firstName: contact.firstName,
          company: contact.company,
          turnaround: REVIEW_TURNAROUND,
        }),
      ])
    : null;

  await supabaseAdmin
    .from("partner_applications")
    .update({
      notified_at: alert.sent ? new Date().toISOString() : null,
      notify_error: alert.sent ? null : alert.error,
      ...(emails
        ? {
            reviewer_email_at: emails[0].at,
            reviewer_email_error: emails[0].error,
            applicant_email_at: emails[1].at,
            applicant_email_error: emails[1].error,
          }
        : {}),
    })
    .eq("id", saved.data.id);

  return { id: saved.data.id, ...routing };
}

type AdminClient = SupabaseClient<Database>;

/** Reads run through the caller's own client, so RLS decides who is an admin. */
export async function listApplications(supabase: AdminClient): Promise<StoredApplication[]> {
  const { data, error } = await supabase
    .from("partner_applications")
    .select(
      "id, first_name, last_name, email, phone, company, active_clients_bucket, starting_soon_bucket, routed_path, escalated, status, reviewer_note, created_at, notified_at, notify_error, reviewer_email_at, reviewer_email_error, applicant_email_at, applicant_email_error",
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;

  return (data ?? []).map((r) => ({
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    email: r.email,
    phone: r.phone,
    company: r.company,
    activeClients: r.active_clients_bucket,
    startingSoon: r.starting_soon_bucket,
    path: r.routed_path,
    escalated: r.escalated,
    status: r.status,
    reviewerNote: r.reviewer_note,
    createdAt: r.created_at,
    notifiedAt: r.notified_at,
    notifyError: r.notify_error,
    reviewerEmailAt: r.reviewer_email_at,
    reviewerEmailError: r.reviewer_email_error,
    applicantEmailAt: r.applicant_email_at,
    applicantEmailError: r.applicant_email_error,
    verdict: classifyApplication({ email: r.email, company: r.company }),
  }));
}

export async function setApplicationStatus(
  supabase: AdminClient,
  userId: string,
  id: string,
  status: ApplicationStatus,
  note: string | null,
) {
  const { data, error } = await supabase
    .from("partner_applications")
    .update({
      status,
      reviewer_note: note,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  // RLS refuses the write for anyone who is not a platform admin, and an
  // update that matches nothing returns no error. Dispatch 91: the row is
  // read back, so "reviewed" on screen means a review was actually recorded.
  if (error || !data) throw new Error("Application not found");
}

export type { ActiveClientBucket, StartingSoonBucket };
