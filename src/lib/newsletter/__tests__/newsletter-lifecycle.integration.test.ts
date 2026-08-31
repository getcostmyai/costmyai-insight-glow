/**
 * The newsletter lifecycle against the real database.
 *
 * The two behaviours worth a real table rather than a mock are the ones a unit
 * test cannot honestly assert: a confirm token that stops working the instant
 * it is used, and an unsubscribe that survives being clicked twice. Both are
 * enforced by conditional SQL, not by application branching, so only a real
 * round trip proves them.
 *
 * The mail send is the one thing stubbed — no test should be able to put a
 * message in front of a person.
 */
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { guardIntegrationDatabase } from "@/lib/__tests__/support/isolation";

type SendArgs = [string, string, { templateData: { confirmUrl: string; unsubscribeUrl: string } }];
const sendTemplateEmail = vi.fn(async (..._args: SendArgs) => ({ sent: true as const }));
vi.mock("@/lib/email-templates/send-email", () => ({
  sendTemplateEmail: (...args: SendArgs) => sendTemplateEmail(...args),
}));

const admin = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

guardIntegrationDatabase(admin);

const emails: string[] = [];
const address = (label: string) => {
  const email = `newsletter-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@integration-test.invalid`;
  emails.push(email);
  return email;
};

afterAll(async () => {
  if (emails.length) await admin.from("newsletter_subscribers").delete().in("email", emails);
});

/** The token the confirmation mail would have carried for the most recent send. */
function lastConfirmToken(): string {
  const call = sendTemplateEmail.mock.calls.at(-1)!;
  return new URL(call[2].templateData.confirmUrl).searchParams.get("token")!;
}

beforeEach(() => {
  sendTemplateEmail.mockClear();
});

describe("newsletter signup", () => {
  it("stores a pending subscriber and mails exactly one confirmation", async () => {
    const { subscribe } = await import("../newsletter.server");
    const email = address("signup");

    const outcome = await subscribe(email, "Footer Form");
    expect(outcome).toEqual({ status: "pending" });
    expect(sendTemplateEmail).toHaveBeenCalledTimes(1);
    expect(sendTemplateEmail.mock.calls[0]![0]).toBe("newsletter-confirm");

    const { data } = await admin
      .from("newsletter_subscribers")
      .select("status, source, confirm_token, confirmed_at, is_synthetic")
      .eq("email", email)
      .single();

    expect(data!.status).toBe("pending");
    expect(data!.source).toBe("footer-form");
    expect(data!.confirmed_at).toBeNull();
    expect(data!.is_synthetic).toBe(false);
    expect(data!.confirm_token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("re-sends with a fresh token when a pending address signs up again", async () => {
    const { subscribe } = await import("../newsletter.server");
    const email = address("resend");

    await subscribe(email);
    const first = lastConfirmToken();
    await subscribe(email);
    const second = lastConfirmToken();

    expect(second).not.toBe(first);
    expect(sendTemplateEmail).toHaveBeenCalledTimes(2);

    // Still exactly one row: the unique index on lower(email) is what holds
    // the list to one entry per person.
    const { count } = await admin
      .from("newsletter_subscribers")
      .select("id", { count: "exact", head: true })
      .eq("email", email);
    expect(count).toBe(1);

    // The superseded token is dead, not merely unused.
    const { confirmSubscription } = await import("../newsletter.server");
    expect(await confirmSubscription(first)).toEqual({ status: "invalid" });
  });

  it("stays silent for an address that is already confirmed", async () => {
    const { subscribe, confirmSubscription } = await import("../newsletter.server");
    const email = address("already");

    await subscribe(email);
    await confirmSubscription(lastConfirmToken());
    sendTemplateEmail.mockClear();

    // Same shape a brand-new address gets from the server function's point of
    // view, and no second mail: nothing here reveals membership.
    expect(await subscribe(email)).toEqual({ status: "noop" });
    expect(sendTemplateEmail).not.toHaveBeenCalled();

    const { data } = await admin
      .from("newsletter_subscribers")
      .select("status")
      .eq("email", email)
      .single();
    expect(data!.status).toBe("confirmed");
  });

  it("refuses an invalid address before it touches the database", async () => {
    const { subscribe } = await import("../newsletter.server");
    await expect(subscribe("not-an-email")).rejects.toThrow(/valid email/i);
    expect(sendTemplateEmail).not.toHaveBeenCalled();
  });
});

describe("confirmation token", () => {
  it("confirms once and is dead on the second use", async () => {
    const { subscribe, confirmSubscription } = await import("../newsletter.server");
    const email = address("single-use");

    await subscribe(email);
    const token = lastConfirmToken();

    const first = await confirmSubscription(token);
    expect(first.status).toBe("confirmed");
    expect(first.unsubscribeToken).toMatch(/^[0-9a-f]{64}$/);
    expect(first.unsubscribeToken).not.toBe(token);

    // Replay: a clear "invalid", never an ambiguous throw.
    expect(await confirmSubscription(token)).toEqual({ status: "invalid" });

    const { data } = await admin
      .from("newsletter_subscribers")
      .select("status, confirmed_at, confirm_token")
      .eq("email", email)
      .single();
    expect(data!.status).toBe("confirmed");
    expect(data!.confirmed_at).not.toBeNull();
    expect(data!.confirm_token).toBe(first.unsubscribeToken);
  });

  it("resolves exactly one winner when the link is clicked twice at once", async () => {
    const { subscribe, confirmSubscription } = await import("../newsletter.server");
    const email = address("race");

    await subscribe(email);
    const token = lastConfirmToken();

    const results = await Promise.all([confirmSubscription(token), confirmSubscription(token)]);
    const confirmed = results.filter((r) => r.status === "confirmed");
    expect(confirmed).toHaveLength(1);
  });

  it("rejects a token that was never issued, without a lookup error", async () => {
    const { confirmSubscription } = await import("../newsletter.server");
    expect(await confirmSubscription("f".repeat(64))).toEqual({ status: "invalid" });
    expect(await confirmSubscription("nonsense")).toEqual({ status: "invalid" });
  });
});

describe("unsubscribe", () => {
  it("is idempotent: twice is success twice, not an error", async () => {
    const { subscribe, confirmSubscription, unsubscribeByToken } = await import("../newsletter.server");
    const email = address("unsub");

    await subscribe(email);
    const confirmed = await confirmSubscription(lastConfirmToken());
    const token = confirmed.unsubscribeToken!;

    expect(await unsubscribeByToken(token)).toEqual({ status: "unsubscribed" });
    const { data: first } = await admin
      .from("newsletter_subscribers")
      .select("status, unsubscribed_at")
      .eq("email", email)
      .single();
    expect(first!.status).toBe("unsubscribed");
    expect(first!.unsubscribed_at).not.toBeNull();

    expect(await unsubscribeByToken(token)).toEqual({ status: "unsubscribed" });
    const { data: second } = await admin
      .from("newsletter_subscribers")
      .select("unsubscribed_at")
      .eq("email", email)
      .single();
    // The timestamp is the moment they left, not the moment they last clicked.
    expect(second!.unsubscribed_at).toBe(first!.unsubscribed_at);
  });

  it("works from a pending subscription too — leaving never requires confirming first", async () => {
    const { subscribe, unsubscribeByToken } = await import("../newsletter.server");
    const email = address("unsub-pending");

    await subscribe(email);
    expect(await unsubscribeByToken(lastConfirmToken())).toEqual({ status: "unsubscribed" });
  });

  it("lets someone who left rejoin", async () => {
    const { subscribe, confirmSubscription, unsubscribeByToken } = await import("../newsletter.server");
    const email = address("rejoin");

    await subscribe(email);
    await unsubscribeByToken(lastConfirmToken());

    expect(await subscribe(email)).toEqual({ status: "pending" });
    const rejoined = await confirmSubscription(lastConfirmToken());
    expect(rejoined.status).toBe("confirmed");

    const { data } = await admin
      .from("newsletter_subscribers")
      .select("status, unsubscribed_at")
      .eq("email", email)
      .single();
    expect(data!.status).toBe("confirmed");
    expect(data!.unsubscribed_at).toBeNull();
  });

  it("rejects an unknown token", async () => {
    const { unsubscribeByToken } = await import("../newsletter.server");
    expect(await unsubscribeByToken("a".repeat(64))).toEqual({ status: "invalid" });
  });
});
