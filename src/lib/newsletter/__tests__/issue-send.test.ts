/**
 * The two properties of a real send that must never be taken on trust.
 *
 * 1. A retry after a partial failure does not double-send. The unique
 *    constraint on (issue_id, subscriber_id) is what makes this expressible at
 *    all, but the constraint alone does not stop a second *email*: the run has
 *    to compute its recipient list from the rows already marked 'sent'. That
 *    computation is what is asserted here, by counting real send attempts per
 *    address across two runs.
 *
 * 2. The count shown on the confirmation screen is the same query the send
 *    uses to build its recipient list. A confirmation dialog that says "247"
 *    and then mails 300 people is worse than no dialog at all.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

interface Subscriber {
  id: string;
  email: string;
  status: string;
  is_synthetic: boolean;
  confirm_token: string | null;
  created_at: string;
}

interface SendRow {
  issue_id: string;
  subscriber_id: string;
  status: string;
}

const db = {
  issues: [
    {
      id: "11111111-1111-1111-1111-111111111111",
      title: "Week 12: what moved",
      markdown_body: "## Hello\n\nSome prose.",
      status: "draft",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      sent_at: null as string | null,
    },
  ],
  subscribers: [] as Subscriber[],
  sends: [] as SendRow[],
};

const ISSUE_ID = db.issues[0]!.id;

/** Addresses whose next send attempt throws, simulating a provider failure. */
const failing = new Set<string>();
const attempts: string[] = [];

vi.mock("@/lib/email-templates/send-email", () => ({
  sendTemplateEmail: async (_template: string, to: string) => {
    attempts.push(to);
    if (failing.has(to)) throw new Error("provider exploded");
    return { sent: true as const };
  },
}));

// Bulk issue delivery now goes through Brevo; the idempotency guarantee is the
// same, so the existing assertions stay valid by retargeting the mock.
vi.mock("@/lib/newsletter/brevo-send.server", () => ({
  sendBrevoNewsletter: async (to: string, _options: any) => {
    attempts.push(to);
    if (failing.has(to)) throw new Error("provider exploded");
    return { sent: true as const };
  },
}));

vi.mock("@/lib/partner-welcome.server", () => ({
  siteOrigin: () => "https://costmyai.test",
}));

/**
 * A deliberately small fake of the two PostgREST call shapes this module uses.
 * Faking the client rather than the network keeps the assertions on the
 * *decisions* the send loop makes; the SQL-level guarantees have their own
 * integration coverage.
 */
function table(name: string) {
  if (name === "newsletter_issues") {
    let matched = [...db.issues];
    const builder: any = {
      select: () => builder,
      eq: (_col: string, value: string) => {
        matched = db.issues.filter((i) => i.id === value);
        return builder;
      },
      order: () => builder,
      limit: async () => ({ data: [...db.issues], error: null }),
      maybeSingle: async () => ({ data: matched[0] ?? null, error: null }),
      single: async () => ({ data: matched[0] ?? null, error: null }),
      update: (patch: Record<string, unknown>) => ({
        eq: async (_col: string, value: string) => {
          const row = db.issues.find((i) => i.id === value);
          if (row) Object.assign(row, patch);
          return { error: null };
        },
      }),
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: [...db.issues], error: null }).then(resolve),
    };
    return builder;
  }

  if (name === "newsletter_subscribers") {
    const filters: Array<(s: Subscriber) => boolean> = [];
    let head = false;
    const rows = () => db.subscribers.filter((s) => filters.every((f) => f(s)));
    const builder: any = {
      select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
        head = Boolean(opts?.head);
        return builder;
      },
      eq: (col: string, value: unknown) => {
        filters.push((s) => (s as unknown as Record<string, unknown>)[col] === value);
        return builder;
      },
      order: async () => ({ data: rows(), error: null }),
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve(
          head ? { count: rows().length, error: null } : { data: rows(), error: null },
        ).then(resolve),
    };
    return builder;
  }

  if (name === "newsletter_sends") {
    const filters: Array<(s: SendRow) => boolean> = [];
    const rows = () => db.sends.filter((s) => filters.every((f) => f(s)));
    const builder: any = {
      select: () => builder,
      eq: (col: string, value: unknown) => {
        filters.push((s) => (s as unknown as Record<string, unknown>)[col] === value);
        return builder;
      },
      upsert: async (values: SendRow[]) => {
        for (const v of values) {
          const existing = db.sends.find(
            (s) => s.issue_id === v.issue_id && s.subscriber_id === v.subscriber_id,
          );
          if (existing) existing.status = v.status;
          else db.sends.push({ ...v });
        }
        return { error: null };
      },
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: rows(), error: null }).then(resolve),
    };
    return builder;
  }

  throw new Error(`unexpected table ${name}`);
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (name: string) => table(name) },
}));

const { sendIssueToAll, confirmedSubscriberCount } = await import("../issues.server");

function subscriber(n: number, status = "confirmed", synthetic = false): Subscriber {
  return {
    id: `sub-${n}`,
    email: `reader${n}@example.test`,
    status,
    is_synthetic: synthetic,
    confirm_token: `token-${n}`,
    created_at: `2026-01-0${(n % 9) + 1}T00:00:00Z`,
  };
}

beforeEach(() => {
  db.subscribers = [
    subscriber(1),
    subscriber(2),
    subscriber(3),
    subscriber(4, "pending"),
    subscriber(5, "unsubscribed"),
    subscriber(6, "confirmed", true),
  ];
  db.sends = [];
  db.issues[0]!.status = "draft";
  db.issues[0]!.sent_at = null;
  attempts.length = 0;
  failing.clear();
});

describe("send idempotency", () => {
  it("does not re-send to anyone already delivered when a partial run is retried", async () => {
    failing.add("reader2@example.test");

    const first = await sendIssueToAll(ISSUE_ID);
    expect(first.confirmed).toBe(3);
    expect(first.attempted).toBe(3);
    expect(first.sent).toBe(2);
    expect(first.failed).toBe(1);
    // A partial run leaves the issue as a draft, so the retry button stays honest.
    expect(db.issues[0]!.status).toBe("draft");

    failing.clear();
    attempts.length = 0;

    const second = await sendIssueToAll(ISSUE_ID);
    // Only the failed recipient is contacted again.
    expect(attempts).toEqual(["reader2@example.test"]);
    expect(second.skipped).toBe(2);
    expect(second.attempted).toBe(1);
    expect(second.sent).toBe(1);
    expect(second.failed).toBe(0);

    // Nobody ends up with two delivered rows, and everyone has exactly one.
    expect(db.sends.filter((s) => s.status === "sent")).toHaveLength(3);
    const perSubscriber = new Set(db.sends.map((s) => `${s.issue_id}:${s.subscriber_id}`));
    expect(perSubscriber.size).toBe(db.sends.length);

    // Once every confirmed subscriber has a delivered row, the issue closes.
    expect(db.issues[0]!.status).toBe("sent");
    expect(db.issues[0]!.sent_at).toBeTruthy();
  });

  it("is a no-op when the whole issue already went out", async () => {
    await sendIssueToAll(ISSUE_ID);
    attempts.length = 0;

    const again = await sendIssueToAll(ISSUE_ID);
    expect(attempts).toEqual([]);
    expect(again.attempted).toBe(0);
    expect(again.skipped).toBe(3);
  });

  it("records no send row for a test send, so a later real send still reaches that address", async () => {
    const { sendTestIssue } = await import("../issues.server");
    await sendTestIssue({ issueId: ISSUE_ID, toEmail: "reader1@example.test" });
    expect(db.sends).toHaveLength(0);

    attempts.length = 0;
    const report = await sendIssueToAll(ISSUE_ID);
    expect(report.attempted).toBe(3);
    expect(attempts).toContain("reader1@example.test");
  });
});

describe("the confirmed count shown before sending", () => {
  it("matches the recipient list the send actually builds", async () => {
    const shown = await confirmedSubscriberCount();
    const report = await sendIssueToAll(ISSUE_ID);

    expect(shown).toBe(3);
    expect(report.confirmed).toBe(shown);
    expect(report.attempted).toBe(shown);
    expect(attempts).toHaveLength(shown);
  });

  it("counts neither pending, unsubscribed nor synthetic subscribers", async () => {
    expect(await confirmedSubscriberCount()).toBe(3);

    db.subscribers.push(subscriber(7, "pending"), subscriber(8, "confirmed", true));
    expect(await confirmedSubscriberCount()).toBe(3);

    db.subscribers.push(subscriber(9));
    expect(await confirmedSubscriberCount()).toBe(4);
  });
});
