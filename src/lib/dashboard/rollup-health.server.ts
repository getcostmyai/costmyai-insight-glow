import { adminClient } from "@/lib/ingest/ingest.server";

import {
  classifyCoverage,
  type RollupCoverage,
} from "./rollup-health";

/**
 * The database side of the rollup coverage check.
 *
 * Kept to four narrow reads so it can sit on the dashboard's hot path: the
 * newest event, the newest day bucket, and — only for the day the newest event
 * falls in — the raw event count against the rolled-up request count. The
 * expensive question ("is every day in history covered?") belongs to the sweep
 * job, not to a page render, so it is passed in rather than computed here.
 */

const DAY_MS = 24 * 60 * 60_000;

function dayBounds(iso: string): { from: string; to: string } {
  const d = new Date(iso);
  const from = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return { from: new Date(from).toISOString(), to: new Date(from + DAY_MS).toISOString() };
}

export async function readRollupCoverage(
  orgId: string,
  now: number = Date.now(),
): Promise<RollupCoverage> {
  const db = adminClient();

  const [{ data: newestEvent }, { data: newestBucket }] = await Promise.all([
    db
      .from("usage_events")
      .select("occurred_at")
      .eq("org_id", orgId)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("usage_rollups")
      .select("bucket_start")
      .eq("org_id", orgId)
      .eq("granularity", "day")
      .order("bucket_start", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const lastEventAt = newestEvent?.occurred_at ?? null;
  const lastBucketStart = newestBucket?.bucket_start ?? null;

  if (!lastEventAt) {
    return classifyCoverage(
      { lastEventAt: null, lastBucketStart, eventsOnLastDay: 0, rolledOnLastDay: 0, missingDays: 0 },
      now,
    );
  }

  const { from, to } = dayBounds(lastEventAt);

  const [{ count }, { data: rolled }] = await Promise.all([
    db
      .from("usage_events")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .gte("occurred_at", from)
      .lt("occurred_at", to),
    db
      .from("usage_rollups")
      .select("requests")
      .eq("org_id", orgId)
      .eq("granularity", "day")
      .eq("bucket_start", from),
  ]);

  return classifyCoverage(
    {
      lastEventAt,
      lastBucketStart,
      eventsOnLastDay: count ?? 0,
      rolledOnLastDay: (rolled ?? []).reduce((s, r) => s + (r.requests ?? 0), 0),
      missingDays: 0,
    },
    now,
  );
}
