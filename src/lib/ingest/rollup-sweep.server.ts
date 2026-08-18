import { readRollupCoverage } from "@/lib/dashboard/rollup-health.server";
import { coverageIsFaulty, type RollupCoverage } from "@/lib/dashboard/rollup-health";

import { adminClient, rebuildRollups } from "./ingest.server";

/**
 * The scheduled rollup check this product did not have.
 *
 * Until now rollups were only ever built inline, inside an ingest request,
 * after the events had already been committed. Nothing ran on a schedule and
 * nothing compared the two tables, so a rebuild that threw left the events
 * stored, the ingest banner green and every figure understated with no record
 * anywhere that it had happened.
 *
 * This sweep does two things and says which it did: it measures the gap for
 * every workspace, and — because the repair is deterministic and derives only
 * from events already stored — it closes the gap rather than merely reporting
 * it. It never invents a row: `rebuildRollups` re-derives the window from
 * `usage_events` exactly as the ingest path would have.
 */

/** Never re-derive more than this in one pass; a longer hole is escalated. */
export const REPAIR_WINDOW_DAYS = 7;

const DAY_MS = 24 * 60 * 60_000;

export interface OrgSweepResult {
  orgId: string;
  state: RollupCoverage["state"];
  missingRequests: number;
  repaired: boolean;
  bucketsWritten: number;
  /** Set when the hole is older than one pass may safely re-derive. */
  truncated?: boolean;
  error?: string;
}

export interface RollupSweep {
  orgsChecked: number;
  orgsFaulty: number;
  orgsRepaired: number;
  bucketsWritten: number;
  failures: number;
  results: OrgSweepResult[];
}

/**
 * Check every workspace, repairing what it can.
 *
 * `repair: false` makes this a pure measurement — used by the forced-failure
 * proof, where healing the damage before observing it would defeat the point.
 */
export async function sweepRollups(
  opts: { repair?: boolean; now?: number } = {},
): Promise<RollupSweep> {
  const repair = opts.repair !== false;
  const now = opts.now ?? Date.now();
  const db = adminClient();

  const { data: orgs, error } = await db.from("organizations").select("id");
  if (error) throw new Error(`rollup sweep could not list workspaces: ${error.message}`);

  const results: OrgSweepResult[] = [];

  for (const org of orgs ?? []) {
    const orgId = org.id as string;
    let coverage: RollupCoverage;
    try {
      coverage = await readRollupCoverage(orgId, now);
    } catch (err) {
      results.push({
        orgId,
        state: "stale",
        missingRequests: 0,
        repaired: false,
        bucketsWritten: 0,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    // "settling" is the ingest path doing its job a moment ago, and "never" is
    // a workspace with no traffic. Neither is a hole.
    if (!coverageIsFaulty(coverage)) continue;

    const result: OrgSweepResult = {
      orgId,
      state: coverage.state,
      missingRequests: coverage.missingRequests,
      repaired: false,
      bucketsWritten: 0,
    };

    if (repair && coverage.lastEventAt) {
      const lastEvent = new Date(coverage.lastEventAt);
      const earliestAllowed = lastEvent.getTime() - REPAIR_WINDOW_DAYS * DAY_MS;
      const holeStart = coverage.lastBucketStart
        ? Date.parse(coverage.lastBucketStart)
        : earliestAllowed;
      const from = Math.max(holeStart, earliestAllowed);
      result.truncated = holeStart < earliestAllowed;

      try {
        result.bucketsWritten = await rebuildRollups(orgId, [new Date(from), lastEvent]);
        result.repaired = true;
      } catch (err) {
        result.error = err instanceof Error ? err.message : String(err);
      }
    }

    results.push(result);
  }

  return {
    orgsChecked: (orgs ?? []).length,
    orgsFaulty: results.length,
    orgsRepaired: results.filter((r) => r.repaired).length,
    bucketsWritten: results.reduce((s, r) => s + r.bucketsWritten, 0),
    failures: results.filter((r) => r.error).length,
    results,
  };
}
