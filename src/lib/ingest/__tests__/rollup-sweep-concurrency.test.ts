import { describe, expect, it, vi, beforeEach } from "vitest";

import { classifyCoverage } from "@/lib/dashboard/rollup-health";

/**
 * The ~40-large-tenant scenario that was flagged as the breaking point.
 *
 * Measured, not asserted by inspection: each workspace's check + repair is
 * given the real per-tenant cost observed on the demo org (5.3 s check, 8.4 s
 * repair, scaled down by a fixed factor so the test itself stays fast), and the
 * sweep is required to finish inside the schedule's quarter hour while never
 * holding more than `SWEEP_CONCURRENCY` workspaces open at once.
 */

// One real second of measured per-tenant work is simulated as one test
// millisecond, so the test runs in a fifth of a second and its wall clock maps
// straight back to real seconds.
const CHECK_SECONDS = 5.3; // measured: rollup-health head count, demo org
const REPAIR_SECONDS = 8.4; // measured: serial repair pass, demo org
const CHECK_MS = CHECK_SECONDS;
const REPAIR_MS = REPAIR_SECONDS;
const CRON_INTERVAL_S = 15 * 60;

let inFlight = 0;
let peakInFlight = 0;
const realSeconds = { check: CHECK_SECONDS, repair: REPAIR_SECONDS };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

vi.mock("@/lib/dashboard/rollup-health.server", () => ({
  readRollupCoverage: async (_orgId: string, now: number) => {
    inFlight += 1;
    peakInFlight = Math.max(peakInFlight, inFlight);
    await sleep(CHECK_MS);
    inFlight -= 1;
    const day = new Date(now);
    const dayStart = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
    return classifyCoverage(
      {
        lastEventAt: new Date(now - 2 * 60 * 60_000).toISOString(),
        lastBucketStart: new Date(dayStart).toISOString(),
        eventsOnLastDay: 173876,
        rolledOnLastDay: 0,
        missingDays: 0,
      },
      now,
    );
  },
}));

vi.mock("@/lib/ingest/ingest.server", () => ({
  adminClient: () => ({
    from: () => ({
      select: async () => ({
        data: Array.from({ length: 40 }, (_, i) => ({ id: `org-${i}` })),
        error: null,
      }),
    }),
  }),
  rebuildRollups: async () => {
    inFlight += 1;
    peakInFlight = Math.max(peakInFlight, inFlight);
    await sleep(REPAIR_MS);
    inFlight -= 1;
    return 120;
  },
}));

vi.mock("./ingest.server", () => ({
  adminClient: () => ({
    from: () => ({
      select: async () => ({
        data: Array.from({ length: 40 }, (_, i) => ({ id: `org-${i}` })),
        error: null,
      }),
    }),
  }),
  rebuildRollups: async () => {
    inFlight += 1;
    peakInFlight = Math.max(peakInFlight, inFlight);
    await sleep(REPAIR_MS);
    inFlight -= 1;
    return 120;
  },
}));

describe("rollup sweep at 40 large tenants", () => {
  beforeEach(() => {
    inFlight = 0;
    peakInFlight = 0;
  });

  it("finishes inside the cron interval and never exceeds the concurrency limit", async () => {
    const { sweepRollups, SWEEP_CONCURRENCY } = await import("../rollup-sweep.server");

    const started = Date.now();
    const sweep = await sweepRollups({ repair: true });
    const elapsedMs = Date.now() - started;
    const projectedRealSeconds = elapsedMs; // 1 test ms == 1 real second

    const serialSeconds = 40 * (realSeconds.check + realSeconds.repair);

    // Bounded: the pool never opened more workspaces than it is allowed to.
    expect(peakInFlight).toBeLessThanOrEqual(SWEEP_CONCURRENCY);
    expect(peakInFlight).toBeGreaterThan(1);

    // Correct: every workspace was still checked and repaired.
    expect(sweep.orgsChecked).toBe(40);
    expect(sweep.orgsRepaired).toBe(40);
    expect(sweep.failures).toBe(0);
    expect(sweep.bucketsWritten).toBe(40 * 120);

    // Fast enough: comfortably inside the quarter-hour schedule, where the old
    // serial pass would have taken ~9 minutes and grown linearly past it.
    expect(serialSeconds).toBeGreaterThan(500);
    expect(projectedRealSeconds).toBeLessThan(CRON_INTERVAL_S / 2);

    // eslint-disable-next-line no-console
    console.log(
      `40 tenants: serial ${serialSeconds.toFixed(0)}s -> pooled ${projectedRealSeconds.toFixed(0)}s ` +
        `(width ${SWEEP_CONCURRENCY}, peak in-flight ${peakInFlight})`,
    );
  }, 30_000);
});
