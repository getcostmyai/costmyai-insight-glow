/**
 * Billing reconciliation, wired.
 *
 * `pollProvider()` was documented, tested and shipped — and never called by the
 * production container. These tests fail if any link in that chain is removed
 * again: env var → config → reader → HTTP shape → state persistence → an
 * end-to-end `pollOnce()` that reaches the real `pollProvider` and enqueues.
 *
 * The unconfigured case is asserted just as hard: with no
 * `COSTMYAI_BILLING_*_KEY`, no scheduler is constructed at all.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { BILLING_POLL_INTERVAL_MS, billingKeyEnvName, billingKeyFrom, loadConfig } from "../config";
import { createInvoiceReader, OPENAI_COSTS_URL } from "../billing-readers";
import { BillingScheduler, BillingStateStore } from "../billing-schedule";
import { UpstreamQueue } from "../queue";
import type { InvoiceReader } from "../billing-poll";

const base = {
  COSTMYAI_INGEST_TOKEN: "cma_live_test",
  COSTMYAI_BASE_URL: "http://localhost:8080",
};

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), "cma-billing-"));
}

describe("env var → config", () => {
  it("names the variable the way the contract spells the provider", () => {
    expect(billingKeyEnvName("openai")).toBe("COSTMYAI_BILLING_OPENAI_KEY");
    expect(billingKeyEnvName("ai21-labs")).toBe("COSTMYAI_BILLING_AI21_LABS_KEY");
  });

  it("reads the key for the provider this container fronts", () => {
    const config = loadConfig({
      ...base,
      COSTMYAI_UPSTREAM_URL: "https://api.openai.com",
      COSTMYAI_BILLING_OPENAI_KEY: "sk-admin-real",
    });
    expect(config.billingProvider).toBe("openai");
    expect(config.billingKey).toBe("sk-admin-real");
    expect(config.billingPollIntervalMs).toBe(BILLING_POLL_INTERVAL_MS);
  });

  it("ignores a key set for a provider this container does not front", () => {
    const config = loadConfig({
      ...base,
      COSTMYAI_UPSTREAM_URL: "https://api.anthropic.com",
      COSTMYAI_BILLING_OPENAI_KEY: "sk-admin-real",
    });
    expect(config.billingProvider).toBe("anthropic");
    expect(config.billingKey).toBeNull();
  });

  it("treats an empty value as unset rather than as a credential", () => {
    expect(billingKeyFrom({ COSTMYAI_BILLING_OPENAI_KEY: "   " }, "openai")).toBeNull();
  });

  it("persists poll state under the spool directory, so a volume carries it", () => {
    const config = loadConfig({
      ...base,
      COSTMYAI_UPSTREAM_URL: "https://api.openai.com",
      COSTMYAI_SPOOL_DIR: "/var/lib/costmyai/spool",
    });
    expect(config.billingStateFile).toBe("/var/lib/costmyai/spool/billing-state.json");
  });
});

describe("config → reader", () => {
  it("builds a real reader for OpenAI", () => {
    expect(createInvoiceReader("openai", "sk-admin")).not.toBeNull();
  });

  it("returns no reader at all for a provider we have not implemented", () => {
    expect(createInvoiceReader("anthropic", "sk-admin")).toBeNull();
    expect(createInvoiceReader("together", "sk-admin")).toBeNull();
  });
});

describe("reader → HTTP request shape", () => {
  const period = {
    provider: "openai",
    periodStart: "2026-08-01",
    periodEnd: "2026-09-01",
    idempotencyKey: "openai:2026-08-01:2026-09-01",
  };

  it("asks the Costs API for exactly the period, with the admin key as bearer", async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({
        url: String(url),
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
      });
      return new Response(
        JSON.stringify({ data: [{ results: [{ amount: { value: 12.5, currency: "usd" } }] }], has_more: false }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const reader = createInvoiceReader("openai", "sk-admin-real", fetchImpl)!;
    const total = await reader.read(period);

    expect(total).toBe(12.5);
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]!.url);
    expect(`${url.origin}${url.pathname}`).toBe(OPENAI_COSTS_URL);
    expect(url.searchParams.get("start_time")).toBe(String(Date.parse("2026-08-01T00:00:00Z") / 1000));
    expect(url.searchParams.get("end_time")).toBe(String(Date.parse("2026-09-01T00:00:00Z") / 1000));
    expect(calls[0]!.headers["authorization"]).toBe("Bearer sk-admin-real");
  });

  it("follows pagination and sums every page", async () => {
    let call = 0;
    const fetchImpl = (async () => {
      call += 1;
      if (call === 1) {
        return new Response(
          JSON.stringify({ data: [{ results: [{ amount: { value: 3 } }] }], has_more: true, next_page: "p2" }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({ data: [{ results: [{ amount: { value: 4.25 } }] }], has_more: false }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const reader = createInvoiceReader("openai", "sk-admin", fetchImpl)!;
    expect(await reader.read(period)).toBe(7.25);
    expect(call).toBe(2);
  });

  it("reports an unreadable period as uncovered rather than as zero dollars", async () => {
    const fetchImpl = (async () => new Response("nope", { status: 401 })) as unknown as typeof fetch;
    const reader = createInvoiceReader("openai", "sk-bad", fetchImpl)!;
    expect(await reader.read(period)).toBeNull();
  });
});

describe("state round-trip", () => {
  it("survives a simulated restart, so the rolling window resumes", () => {
    const file = join(tmpDir(), "billing-state.json");
    const store = new BillingStateStore(file);

    expect(store.load("openai")).toEqual({ provider: "openai", lastPolledAt: null, historyDays: null });

    store.persist({ provider: "openai", lastPolledAt: "2026-08-30T00:00:00.000Z", historyDays: 365 });

    // A brand-new store object: exactly what a container restart sees.
    expect(new BillingStateStore(file).load("openai")).toEqual({
      provider: "openai",
      lastPolledAt: "2026-08-30T00:00:00.000Z",
      historyDays: 365,
    });
  });

  it("ignores state written for a different provider", () => {
    const file = join(tmpDir(), "billing-state.json");
    new BillingStateStore(file).persist({ provider: "anthropic", lastPolledAt: "2026-08-30T00:00:00.000Z" });
    expect(new BillingStateStore(file).load("openai").lastPolledAt).toBeNull();
  });
});

describe("end-to-end pollOnce()", () => {
  const config = loadConfig({
    ...base,
    COSTMYAI_UPSTREAM_URL: "https://api.openai.com",
    COSTMYAI_BILLING_OPENAI_KEY: "sk-admin-real",
  });

  function reader(value: number): InvoiceReader {
    return { historyDays: 365, read: async () => value };
  }

  it("runs the real pollProvider, enqueues captures and persists state", async () => {
    const file = join(tmpDir(), "billing-state.json");
    const queue = new UpstreamQueue(config, (async () => new Response("{}")) as unknown as typeof fetch);
    const scheduler = new BillingScheduler(
      "openai",
      reader(10),
      queue,
      new BillingStateStore(file),
      config.billingPollIntervalMs,
      () => Date.parse("2026-08-30T09:00:00.000Z"),
    );

    const result = await scheduler.pollOnce();

    expect(result).not.toBeNull();
    expect(result!.isFirstPoll).toBe(true);
    expect(result!.captures).toBeGreaterThan(0);
    expect(queue.size).toBe(1);

    const item = queue.snapshot()[0]!;
    expect(item.kind).toBe("billing");
    const body = item.body as { backfill: boolean; captures: Array<Record<string, unknown>> };
    expect(body.backfill).toBe(true);
    expect(body.captures[0]).toMatchObject({ provider: "openai", currency: "USD", invoiced_usd: 10 });
    // Only totals travel; there is no field a credential could occupy.
    expect(JSON.stringify(body)).not.toContain("sk-admin-real");

    expect(new BillingStateStore(file).load("openai").lastPolledAt).toBe("2026-08-30T09:00:00.000Z");
    expect(scheduler.status()).toMatchObject({ enabled: true, provider: "openai", runs: 1, lastError: null });
  });

  it("a second poll after a restart is the short rolling window, not a fresh backfill", async () => {
    const file = join(tmpDir(), "billing-state.json");
    const fetchImpl = (async () => new Response("{}")) as unknown as typeof fetch;

    const first = new BillingScheduler(
      "openai",
      reader(10),
      new UpstreamQueue(config, fetchImpl),
      new BillingStateStore(file),
      config.billingPollIntervalMs,
      () => Date.parse("2026-08-30T09:00:00.000Z"),
    );
    await first.pollOnce();

    const afterRestart = new BillingScheduler(
      "openai",
      reader(10),
      new UpstreamQueue(config, fetchImpl),
      new BillingStateStore(file),
      config.billingPollIntervalMs,
      () => Date.parse("2026-08-31T09:00:00.000Z"),
    );
    const result = await afterRestart.pollOnce();

    expect(result!.isFirstPoll).toBe(false);
    expect(result!.lookbackDays).toBeLessThan(30);
  });

  it("a failing reader is an observability event, never a throw", async () => {
    const file = join(tmpDir(), "billing-state.json");
    const scheduler = new BillingScheduler(
      "openai",
      { read: async () => { throw new Error("provider billing API down"); } },
      new UpstreamQueue(config, (async () => new Response("{}")) as unknown as typeof fetch),
      new BillingStateStore(file),
      config.billingPollIntervalMs,
    );
    await expect(scheduler.pollOnce()).resolves.toBeNull();
    expect(scheduler.status().lastError).toContain("provider billing API down");
  });
});

describe("the unconfigured container", () => {
  it("builds no scheduler at all when no billing key is set", async () => {
    const { createGateway } = await import("../index");
    const config = loadConfig({
      ...base,
      COSTMYAI_UPSTREAM_URL: "https://api.openai.com",
      COSTMYAI_SPOOL_DIR: tmpDir(),
    });
    expect(config.billingKey).toBeNull();

    const gateway = createGateway(config);
    try {
      expect(gateway.billing).toBeNull();
    } finally {
      await gateway.shutdown("test");
    }
  });

  it("builds no scheduler when a key is set for a provider with no reader", async () => {
    const { createGateway } = await import("../index");
    const config = loadConfig({
      ...base,
      COSTMYAI_UPSTREAM_URL: "https://api.anthropic.com",
      COSTMYAI_BILLING_ANTHROPIC_KEY: "sk-ant-admin",
      COSTMYAI_SPOOL_DIR: tmpDir(),
    });
    expect(config.billingKey).toBe("sk-ant-admin");

    const gateway = createGateway(config);
    try {
      expect(gateway.billing).toBeNull();
    } finally {
      await gateway.shutdown("test");
    }
  });
});
