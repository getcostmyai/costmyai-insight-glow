import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { buildDashboardSnapshot } from "../../dashboard.server";

/**
 * Golden values, straight from the rows.
 *
 * The audit this file answers: the 7-day tab reported a larger "available
 * monthly" than the 30-day tab, which is impossible for anything summed from
 * real traffic. The cause was per-window figures built from 30-day
 * extrapolations. These tests compare the snapshot against the raw rollup rows
 * for the same window and assert the property that failure violated: a shorter
 * window can never carry more money than a longer one.
 */

const URL = process.env["SUPABASE_URL"]!;
const SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
const DEMO_ORG = "00000000-0000-0000-0000-000000000001";
const DAY_MS = 86_400_000;

const admin = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** The raw sum PostgREST returns for a window — the number the UI must match. */
async function rawSpend(days: 1 | 7 | 30) {
  const { data, error } = await admin
    .from("usage_rollups")
    .select("cost_usd")
    .eq("org_id", DEMO_ORG)
    .eq("granularity", days === 1 ? "hour" : "day")
    .gte("bucket_start", new Date(Date.now() - days * DAY_MS).toISOString())
    .limit(100_000);
  if (error) throw error;
  return (data ?? []).reduce((s, r) => s + Number(r.cost_usd), 0);
}

const snapshot = (days: 1 | 7 | 30) => buildDashboardSnapshot({ days, orgId: DEMO_ORG });

describe("period windows are real sums of real rows", () => {
  it("reports exactly the spend the rollup rows contain, on every window", async () => {
    for (const days of [1, 7, 30] as const) {
      const [snap, raw] = await Promise.all([snapshot(days), rawSpend(days)]);
      expect(snap.totals.spend, `${days}d spend`).toBeCloseTo(Math.round(raw * 100) / 100, 1);
    }
  }, 60_000);

  it("never shows more money on a shorter window than on a longer one", async () => {
    const [d1, d7, d30] = await Promise.all([snapshot(1), snapshot(7), snapshot(30)]);

    expect(d1.totals.spend).toBeLessThanOrEqual(d7.totals.spend);
    expect(d7.totals.spend).toBeLessThanOrEqual(d30.totals.spend);

    // The exact inversion reported in the audit: available saving grew as the
    // window shrank, because the lists summed 30-day projections.
    expect(d1.savings.available).toBeLessThanOrEqual(d7.savings.available);
    expect(d7.savings.available).toBeLessThanOrEqual(d30.savings.available);

    expect(d1.savings.captured).toBeLessThanOrEqual(d7.savings.captured);
    expect(d7.savings.captured).toBeLessThanOrEqual(d30.savings.captured);
  }, 60_000);

  it("keeps available saving below the spend it was found in", async () => {
    // A window cannot offer more saving than it spent — the unit mismatch that
    // drove "on cheapest host" to 0% made exactly this claim on the 24h tab.
    for (const days of [1, 7, 30] as const) {
      const snap = await snapshot(days);
      expect(snap.savings.available, `${days}d`).toBeLessThanOrEqual(snap.totals.spend);
    }
  }, 60_000);

  it("counts each workload once, and says how much overlap it removed", async () => {
    const snap = await snapshot(30);
    const listSum =
      snap.hostArbitrage.reduce((s, r) => s + r.saving, 0) +
      snap.qualityMatched.reduce((s, r) => s + r.saving, 0) +
      snap.oversized.reduce((s, o) => s + o.wasted, 0);

    // The headline is never the naive list sum when lists overlap.
    expect(snap.savings.available).toBeLessThanOrEqual(Math.round(listSum * 100) / 100 + 0.01);
    expect(snap.savings.overlapUsd).toBeGreaterThanOrEqual(0);
    if (snap.savings.overlapCount > 0) {
      expect(snap.savings.available + snap.savings.locked).toBeLessThan(snap.savings.gross);
    }
  }, 60_000);

  it("scopes the donut to the window, so it cannot read identically on every tab", async () => {
    const [d7, d30] = await Promise.all([snapshot(7), snapshot(30)]);
    const ring = (s: Awaited<ReturnType<typeof snapshot>>) => s.savings.captured + s.savings.available;
    // Not a hardcoded constant: the 30-day ring covers strictly more traffic.
    expect(ring(d30)).toBeGreaterThan(ring(d7));
  }, 60_000);
});
