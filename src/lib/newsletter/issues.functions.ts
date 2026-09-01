import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isValidEmail } from "./newsletter";
import type { IssueDetail, IssueSummary, SendReport } from "./issues.server";

/**
 * The admin composer's RPC surface.
 *
 * Every entry point re-derives platform-admin status from the session token,
 * the same way the lead queue and customer directory do. The browser never
 * asserts its own rights, and a non-admin gets "Not found" rather than a
 * "Forbidden" that would confirm the route exists.
 */

const UUID = /^[0-9a-f-]{36}$/i;

async function assertPlatformAdmin(context: {
  supabase: { rpc: (fn: "is_platform_admin") => PromiseLike<{ data: unknown; error: unknown }> };
}) {
  const { data, error } = await context.supabase.rpc("is_platform_admin");
  if (error) throw error;
  if (data !== true) throw new Error("Not found");
}

export const listNewsletterIssues = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ issues: IssueSummary[]; confirmed: number }> => {
    await assertPlatformAdmin(context);
    const { listIssues, confirmedSubscriberCount } = await import("./issues.server");
    const [issues, confirmed] = await Promise.all([listIssues(), confirmedSubscriberCount()]);
    return { issues, confirmed };
  });

export const getNewsletterIssue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => {
    if (!UUID.test(data?.id ?? "")) throw new Error("Issue not found");
    return { id: data.id };
  })
  .handler(async ({ data, context }): Promise<IssueDetail | null> => {
    await assertPlatformAdmin(context);
    const { getIssue } = await import("./issues.server");
    return getIssue(data.id);
  });

export const saveNewsletterIssue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id?: string | null; title: string; markdownBody: string }) => {
    const title = (data?.title ?? "").trim();
    const markdownBody = data?.markdownBody ?? "";
    if (title.length < 3) throw new Error("Give the issue a title");
    if (title.length > 160) throw new Error("Titles stay under 160 characters");
    if (markdownBody.trim().length === 0) throw new Error("An empty issue is not an issue");
    if (markdownBody.length > 60_000) throw new Error("That issue is too long to send");
    if (data.id && !UUID.test(data.id)) throw new Error("Issue not found");
    return { id: data.id ?? null, title, markdownBody };
  })
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await assertPlatformAdmin(context);
    const { saveIssue } = await import("./issues.server");
    return saveIssue({ ...data, authorId: context.userId });
  });

export const previewNewsletterIssue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { title: string; markdownBody: string }) => ({
    title: (data?.title ?? "").trim() || "Untitled issue",
    markdownBody: (data?.markdownBody ?? "").slice(0, 60_000),
  }))
  .handler(async ({ data, context }): Promise<{ html: string }> => {
    await assertPlatformAdmin(context);
    const { renderIssueHtml } = await import("./issues.server");
    return { html: await renderIssueHtml(data) };
  });

/**
 * Test send. The recipient is taken from the caller's own verified claims, not
 * from the request body: this button can only ever mail the admin pressing it.
 */
export const sendNewsletterTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => {
    if (!UUID.test(data?.id ?? "")) throw new Error("Issue not found");
    return { id: data.id };
  })
  .handler(async ({ data, context }): Promise<{ sent: boolean; to: string }> => {
    await assertPlatformAdmin(context);

    const claimed = (context.claims as { email?: unknown })?.email;
    let toEmail = typeof claimed === "string" ? claimed : "";
    if (!isValidEmail(toEmail)) {
      const { data: profile } = await context.supabase
        .from("profiles")
        .select("email")
        .eq("id", context.userId)
        .maybeSingle();
      toEmail = typeof profile?.email === "string" ? profile.email : "";
    }
    if (!isValidEmail(toEmail)) throw new Error("Your account has no email address on file");

    const { sendTestIssue } = await import("./issues.server");
    const result = await sendTestIssue({ issueId: data.id, toEmail });
    return { sent: result.sent, to: toEmail };
  });

export const sendNewsletterIssue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; confirmCount: number }) => {
    if (!UUID.test(data?.id ?? "")) throw new Error("Issue not found");
    if (!Number.isInteger(data?.confirmCount) || data.confirmCount < 0)
      throw new Error("Confirm the recipient count first");
    return { id: data.id, confirmCount: data.confirmCount };
  })
  .handler(async ({ data, context }): Promise<SendReport> => {
    await assertPlatformAdmin(context);

    const { confirmedSubscriberCount, sendIssueToAll } = await import("./issues.server");

    // The count the admin agreed to must still be the count on the ground. If
    // the list moved between the confirmation screen and the click, the send
    // stops and the admin re-confirms against the new number.
    const current = await confirmedSubscriberCount();
    if (current !== data.confirmCount) {
      throw new Error(
        `The list changed: ${current} confirmed subscribers now, not ${data.confirmCount}. Re-check and confirm again.`,
      );
    }

    return sendIssueToAll(data.id);
  });
