/**
 * The rule that decides whether the dashboard is allowed to present its figures
 * as complete.
 *
 * These cases are written as claims about money, not about states: every
 * "faulty" reading here is a reading where a customer would otherwise have been
 * shown a spend or saving figure lower than their real one, with nothing on the
 * page saying so.
 */
import { describe, expect, it } from "vitest";

import {
  classifyCoverage,
  coverageCopy,
  coverageIsFaulty,
  ROLLUP_LAG_TOLERANCE_MS,
} from "../rollup-health";

const NOW = Date.parse("2026-08-18T12:00:00.000Z");

describe("classifyCoverage", () => {
  it("says nothing is wrong when no traffic has ever arrived", () => {
    const c = classifyCoverage(
      {
        lastEventAt: null,
        lastBucketStart: null,
        eventsOnLastDay: 0,
        rolledOnLastDay: 0,
        missingDays: 0,
      },
      NOW,
    );
    expect(c.state).toBe("never");
    expect(coverageIsFaulty(c)).toBe(false);
    expect(c.dataAsOf).toBeNull();
  });

  it("reports ok, and dates the figures to the newest event, when coverage is complete", () => {
    const c = classifyCoverage(
      {
        lastEventAt: "2026-08-18T11:40:00.000Z",
        lastBucketStart: "2026-08-18T00:00:00.000Z",
        eventsOnLastDay: 900,
        rolledOnLastDay: 900,
        missingDays: 0,
      },
      NOW,
    );
    expect(c.state).toBe("ok");
    expect(c.dataAsOf).toBe("2026-08-18T11:40:00.000Z");
    expect(c.lagMs).toBe(0);
  });

  it("tolerates a batch that landed inside the settling window", () => {
    const c = classifyCoverage(
      {
        lastEventAt: new Date(NOW - 60_000).toISOString(),
        lastBucketStart: "2026-08-18T00:00:00.000Z",
        eventsOnLastDay: 900,
        rolledOnLastDay: 880,
        missingDays: 0,
      },
      NOW,
    );
    expect(c.state).toBe("settling");
    expect(coverageIsFaulty(c)).toBe(false);
    expect(c.missingRequests).toBe(20);
  });

  it("calls the same shortfall a real gap once the settling window has passed", () => {
    const c = classifyCoverage(
      {
        lastEventAt: new Date(NOW - ROLLUP_LAG_TOLERANCE_MS - 60_000).toISOString(),
        lastBucketStart: "2026-08-18T00:00:00.000Z",
        eventsOnLastDay: 900,
        rolledOnLastDay: 880,
        missingDays: 0,
      },
      NOW,
    );
    expect(c.state).toBe("partial");
    expect(coverageIsFaulty(c)).toBe(true);
    expect(coverageCopy(c)).toContain("20 requests");
  });

  it("reports whole uncovered days as stale, and dates the figures to the last covered day", () => {
    const c = classifyCoverage(
      {
        lastEventAt: "2026-08-18T11:00:00.000Z",
        lastBucketStart: "2026-08-15T00:00:00.000Z",
        eventsOnLastDay: 400,
        rolledOnLastDay: 0,
        missingDays: 3,
      },
      NOW,
    );
    expect(c.state).toBe("stale");
    expect(c.dataAsOf).toBe("2026-08-16T00:00:00.000Z");
    expect(c.missingDays).toBe(3);
    expect(coverageCopy(c)).toContain("understates");
  });

  it("treats traffic with no rollup at all as stale, not as ok", () => {
    const c = classifyCoverage(
      {
        lastEventAt: "2026-08-18T11:00:00.000Z",
        lastBucketStart: null,
        eventsOnLastDay: 400,
        rolledOnLastDay: 0,
        missingDays: 1,
      },
      NOW,
    );
    expect(c.state).toBe("stale");
    expect(c.dataAsOf).toBeNull();
    expect(coverageIsFaulty(c)).toBe(true);
  });

  it("never faults a synthetic workspace that has rollups ahead of its events", () => {
    // Demo orgs are seeded with rollup rows and no underlying events. The check
    // is one-directional on purpose: extra coverage is not a fault.
    const c = classifyCoverage(
      {
        lastEventAt: "2026-08-18T11:00:00.000Z",
        lastBucketStart: "2026-08-18T00:00:00.000Z",
        eventsOnLastDay: 10,
        rolledOnLastDay: 5_000,
        missingDays: 0,
      },
      NOW,
    );
    expect(c.state).toBe("ok");
    expect(c.missingRequests).toBe(0);
  });
});
