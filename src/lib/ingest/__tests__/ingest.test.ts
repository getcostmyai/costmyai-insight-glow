import { existsSync } from "fs";
import { describe, expect, it } from "vitest";

import {
  advanceConnectionState,
  backfillPeriods,
  periodDayCount,
  planBillingPoll,
  splitIntoInvoicePeriods,
} from "@/lib/ingest/backfill";
import {
  BACKFILL_LOOKBACK_DAYS,
  captureIdempotencyKey,
  INGEST_API_VERSION,
  INGEST_PATHS,
  providerForHost,
  ROLLING_WINDOW_DAYS,
} from "@/lib/ingest/contract";
import { billingBatchSchema, ingestBatchSchema } from "@/lib/ingest/schema";
import { INGEST_PATHS as CONTAINER_PATHS, INGEST_API_VERSION as CONTAINER_VERSION } from "../../../../packages/gateway-container/src/config";
import { pollProvider, type InvoiceReader } from "../../../../packages/gateway-container/src/billing-poll";
import { UpstreamQueue } from "../../../../packages/gateway-container/src/queue";
import { verdictFor } from "@/lib/ingest/billing.server";

const NOW = new Date("2026-07-31T12:00:00Z");

const validEvent = {
  model_key: "gpt-5.5",
  host: "api.openai.com",
  task_hint: "generation" as const,
  input_tokens: 100,
  output_tokens: 200,
};

describe("payload contract", () => {
  it("accepts a versioned metadata batch", () => {
    const parsed = ingestBatchSchema.safeParse({ v: 1, events: [validEvent] });
    expect(parsed.success).toBe(true);
  });

  it("defaults the version when a client omits it", () => {
    const parsed = ingestBatchSchema.parse({ events: [validEvent] });
    expect(parsed.v).toBe(INGEST_API_VERSION);
  });

  it("refuses an unknown payload version", () => {
    expect(ingestBatchSchema.safeParse({ v: 2, events: [validEvent] }).success).toBe(false);
  });

  it("rejects any payload carrying prompt or completion content", () => {
    for (const contentField of ["prompt", "completion", "messages", "input", "output", "text"]) {
      const parsed = ingestBatchSchema.safeParse({
        v: 1,
        events: [{ ...validEvent, [contentField]: "who is the president of france" }],
      });
      expect(parsed.success, `${contentField} must be rejected`).toBe(false);
    }
  });

  it("rejects a payload carrying a credential", () => {
    for (const credentialField of ["api_key", "authorization", "openai_key", "secret"]) {
      const parsed = ingestBatchSchema.safeParse({
        v: 1,
        events: [{ ...validEvent, [credentialField]: "sk-live-abc" }],
      });
      expect(parsed.success, `${credentialField} must be rejected`).toBe(false);
    }
  });

  it("caps a batch at 1000 events rather than truncating it", () => {
    const events = Array.from({ length: 1001 }, () => validEvent);
    expect(ingestBatchSchema.safeParse({ v: 1, events }).success).toBe(false);
  });

  it("requires a billing period that actually spans time", () => {
    const capture = {
      provider: "openai",
      period_start: "2026-07-01",
      period_end: "2026-07-01",
      invoiced_usd: 100,
    };
    expect(billingBatchSchema.safeParse({ v: 1, captures: [capture] }).success).toBe(false);
    expect(
      billingBatchSchema.safeParse({ v: 1, captures: [{ ...capture, period_end: "2026-08-01" }] }).success,
    ).toBe(true);
  });
});

describe("configured paths match live routes", () => {
  it("every path the container posts to resolves to a real route file", () => {
    for (const path of Object.values(INGEST_PATHS)) {
      const file = `src/routes${path}.ts`;
      expect(existsSync(file), `${path} has no route file at ${file}`).toBe(true);
    }
  });

  it("the container's config mirrors the server contract exactly", () => {
    expect(CONTAINER_PATHS).toEqual(INGEST_PATHS);
    expect(CONTAINER_VERSION).toBe(INGEST_API_VERSION);
  });
});

describe("first-connection backfill", () => {
  it("uses a 30-day lookback on the first poll", () => {
    const plan = planBillingPoll({ provider: "openai" }, NOW);
    expect(plan.isFirstPoll).toBe(true);
    expect(plan.requestedLookbackDays).toBe(BACKFILL_LOOKBACK_DAYS);
    expect(plan.effectiveLookbackDays).toBe(30);
    const covered = plan.periods.reduce((sum, p) => sum + periodDayCount(p), 0);
    expect(covered).toBe(30);
  });

  it("reverts to the rolling window on every subsequent poll", () => {
    const plan = planBillingPoll(
      { provider: "openai", lastPolledAt: "2026-07-30T12:00:00.000Z" },
      NOW,
    );
    expect(plan.isFirstPoll).toBe(false);
    expect(plan.effectiveLookbackDays).toBe(ROLLING_WINDOW_DAYS);
    expect(plan.periods.reduce((sum, p) => sum + periodDayCount(p), 0)).toBe(ROLLING_WINDOW_DAYS);
  });

  it("splits the backfill on calendar-month boundaries so periods tile without overlap", () => {
    const periods = backfillPeriods("openai", NOW);
    expect(periods.map((p) => `${p.periodStart}→${p.periodEnd}`)).toEqual([
      "2026-07-02→2026-08-01",
    ]);

    const spanning = splitIntoInvoicePeriods(
      "openai",
      new Date("2026-06-20T00:00:00Z"),
      new Date("2026-07-05T00:00:00Z"),
    );
    expect(spanning.map((p) => [p.periodStart, p.periodEnd])).toEqual([
      ["2026-06-20", "2026-07-01"],
      ["2026-07-01", "2026-07-05"],
    ]);
    // No day is counted twice.
    expect(spanning[0].periodEnd).toBe(spanning[1].periodStart);
  });

  it("surfaces a coverage note when the provider's history is shorter than 30 days", () => {
    const plan = planBillingPoll({ provider: "venice", historyDays: 12 }, NOW);
    expect(plan.effectiveLookbackDays).toBe(12);
    expect(plan.coverageNote).toContain("12 days");
    expect(plan.coverageNote).toContain("18");
    // The gap is declared, not silently swallowed by a shorter window.
    expect(plan.periods.reduce((sum, p) => sum + periodDayCount(p), 0)).toBe(12);
  });

  it("declares zero coverage rather than pretending a provider has history", () => {
    const plan = planBillingPoll({ provider: "somehost", historyDays: 0 }, NOW);
    expect(plan.periods).toHaveLength(0);
    expect(plan.coverageNote).toContain("no invoice history");
  });
});

function reader(historyDays?: number | null): InvoiceReader {
  return { historyDays, read: async () => 1234.56 };
}

function queueFor(sink: unknown[]): UpstreamQueue {
  const q = new UpstreamQueue(
    { baseUrl: "https://app.costmyai.com", ingestToken: "cma_live_test", spoolDir: "/tmp", flushIntervalMs: 1 },
    (async () => new Response("{}", { status: 200 })) as unknown as typeof fetch,
  );
  const originalEnqueue = q.enqueue.bind(q);
  q.enqueue = (item) => {
    sink.push(item);
    originalEnqueue(item);
  };
  return q;
}

describe("container billing poll", () => {
  it("first poll backfills 30 days, second poll does not", async () => {
    const sink: unknown[] = [];
    const first = await pollProvider({ provider: "openai" }, reader(), queueFor(sink), NOW);
    expect(first.isFirstPoll).toBe(true);
    expect(first.lookbackDays).toBe(30);

    const second = await pollProvider(first.state, reader(), queueFor(sink), new Date("2026-08-01T12:00:00Z"));
    expect(second.isFirstPoll).toBe(false);
    expect(second.lookbackDays).toBe(ROLLING_WINDOW_DAYS);
  });

  it("a double run produces exactly one capture per provider-period", async () => {
    const runA: unknown[] = [];
    const runB: unknown[] = [];
    await pollProvider({ provider: "openai" }, reader(), queueFor(runA), NOW);
    // A reconnect: state is wiped, so it is a "first" poll all over again.
    await pollProvider({ provider: "openai" }, reader(), queueFor(runB), NOW);

    const keysOf = (items: unknown[]) =>
      items.flatMap((i) =>
        ((i as { body: { captures: Array<{ idempotency_key: string }> } }).body.captures ?? []).map(
          (c) => c.idempotency_key,
        ),
      );

    const a = keysOf(runA);
    const b = keysOf(runB);
    expect(a).toEqual(b);
    expect(new Set([...a, ...b]).size).toBe(a.length);
    expect(a[0]).toBe(captureIdempotencyKey("openai", "2026-07-02", "2026-08-01"));
  });

  it("passes the provider's short-history coverage note upstream", async () => {
    const sink: unknown[] = [];
    const result = await pollProvider({ provider: "venice" }, reader(9), queueFor(sink), NOW);
    expect(result.coverageNotes[0]).toContain("9 days");
    const capture = (sink[0] as { body: { captures: Array<{ coverage_note?: string }> } }).body.captures[0];
    expect(capture.coverage_note).toContain("9 days");
  });
});

describe("offline-safe queue", () => {
  it("keeps metadata queued through a network partition and drains it after", async () => {
    let online = false;
    const seen: string[] = [];
    const queue = new UpstreamQueue(
      { baseUrl: "https://app.costmyai.com", ingestToken: "cma_live_test", spoolDir: "/tmp", flushIntervalMs: 1 },
      (async (url: string) => {
        if (!online) throw new Error("ECONNREFUSED");
        seen.push(String(url));
        return new Response("{}", { status: 200 });
      }) as unknown as typeof fetch,
    );

    queue.enqueue({ kind: "events", body: { events: [validEvent] } });
    queue.enqueue({ kind: "events", body: { events: [validEvent] } });

    const partitioned = await queue.drain();
    expect(partitioned.sent).toBe(0);
    expect(partitioned.remaining).toBe(2);
    expect(partitioned.lastError).toContain("ECONNREFUSED");

    online = true;
    const recovered = await queue.drain();
    expect(recovered.sent).toBe(2);
    expect(queue.size).toBe(0);
    expect(seen.every((u) => u.endsWith(INGEST_PATHS.events))).toBe(true);
  });

  it("explains a rotated token instead of dropping traffic", async () => {
    const queue = new UpstreamQueue(
      { baseUrl: "https://app.costmyai.com", ingestToken: "cma_live_old", spoolDir: "/tmp", flushIntervalMs: 1 },
      (async () => new Response("Unauthorized", { status: 401 })) as unknown as typeof fetch,
    );
    queue.enqueue({ kind: "events", body: { events: [validEvent] } });
    const report = await queue.drain();
    expect(report.sent).toBe(0);
    expect(report.remaining).toBe(1);
    expect(report.lastError).toMatch(/rotated or revoked/i);
  });
});

describe("provider attribution and reconciliation verdicts", () => {
  it("maps hosts to the invoice they land on", () => {
    expect(providerForHost("api.openai.com")).toBe("openai");
    expect(providerForHost("myorg.openai.azure.com")).toBe("azure");
    // Unknown hosts reconcile under themselves rather than being guessed.
    expect(providerForHost("api.unknown-host.dev")).toBe("api.unknown-host.dev");
  });

  it("calls a small gap noise and a real gap a disagreement", () => {
    expect(verdictFor(1000, 1015).verdict).toBe("match");
    expect(verdictFor(1000, 1120).verdict).toBe("under_estimated");
    expect(verdictFor(1000, 880).verdict).toBe("over_estimated");
  });
});

describe("connection state", () => {
  it("records the poll time so the next run is not treated as a first connection", () => {
    const next = advanceConnectionState({ provider: "openai" }, NOW);
    expect(next.lastPolledAt).toBe(NOW.toISOString());
    expect(planBillingPoll(next, NOW).isFirstPoll).toBe(false);
  });
});

describe("billing poll cadence", () => {
  it("polls once per hour, globally, and fails CI if that drifts", async () => {
    const { BILLING_POLL_INTERVAL_MS } = await import("@/lib/ingest/contract");
    expect(BILLING_POLL_INTERVAL_MS).toBe(60 * 60 * 1000);
    expect(BILLING_POLL_INTERVAL_MS).toBe(3_600_000);
  });

  it("keeps the cadence global — no per-provider override exists", async () => {
    const contract = await import("@/lib/ingest/contract");
    const perProvider = Object.keys(contract).filter(
      (k) => /POLL/i.test(k) && k !== "BILLING_POLL_INTERVAL_MS",
    );
    expect(perProvider).toEqual([]);
  });
});
