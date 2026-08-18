/**
 * Rollup coverage: the one check that asks whether the figures on the
 * dashboard are actually derived from the traffic the customer sent.
 *
 * Everything else in this product measures a *feed* — pricing, benchmarks,
 * ingest arrival. None of them measure the transform in between. Rollups are
 * rebuilt inline, inside the ingest request, after `usage_events` has already
 * been committed; if that rebuild throws, the events are safely stored, the
 * ingest banner stays green because events are arriving, and every spend,
 * saving and switch figure quietly understates for as long as it takes
 * somebody to notice. Nothing measured that until this module existed.
 *
 * The comparison is deliberately direction-sensitive. It asks only "is there
 * traffic we have not rolled up", never the reverse: synthetic workspaces are
 * seeded with rollups that have no underlying events, and treating that as a
 * fault would make the check cry wolf on the demo the moment it shipped.
 */

/** Rolled-up data may trail live events by this much before it is a fault. */
export const ROLLUP_LAG_TOLERANCE_MS = 15 * 60_000;

export type RollupState =
  /** No traffic has ever arrived — there is nothing to roll up. */
  | "never"
  /** Every event we hold is represented in the rollups. */
  | "ok"
  /** Today's newest batch is not fully rolled up yet, and it is recent. */
  | "settling"
  /** Events on the newest day are missing from that day's rollup. */
  | "partial"
  /** Whole days of traffic have no rollup at all. */
  | "stale";

export interface RollupCoverage {
  state: RollupState;
  /** Newest event we hold, whether or not it has been rolled up. */
  lastEventAt: string | null;
  /** Start of the newest day bucket we have written. */
  lastBucketStart: string | null;
  /**
   * The moment the figures are true as of: the newest event that is actually
   * represented in the rollups. This — not the request clock — is what the
   * dashboard is allowed to print next to "last read".
   */
  dataAsOf: string | null;
  /** How far the rolled-up figures trail the newest event, in ms. */
  lagMs: number | null;
  /** Events on the newest day that the rollup does not account for. */
  missingRequests: number;
  /** Whole days that carry events and no rollup row. */
  missingDays: number;
}

export interface CoverageInput {
  lastEventAt: string | null;
  lastBucketStart: string | null;
  /** Raw events on the day of the newest event. */
  eventsOnLastDay: number;
  /** Requests the rollup accounts for on that same day. */
  rolledOnLastDay: number;
  /** Days carrying events with no rollup row at all. */
  missingDays: number;
}

const DAY_MS = 24 * 60 * 60_000;

const dayStart = (iso: string) => {
  const d = new Date(iso);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

/**
 * Pure classifier, so the rule this product enforces can be tested without a
 * database and cannot drift between the dashboard and the sweep job.
 */
export function classifyCoverage(input: CoverageInput, now: number = Date.now()): RollupCoverage {
  const { lastEventAt, lastBucketStart } = input;

  if (!lastEventAt) {
    return {
      state: "never",
      lastEventAt: null,
      lastBucketStart,
      dataAsOf: null,
      lagMs: null,
      missingRequests: 0,
      missingDays: 0,
    };
  }

  const missingRequests = Math.max(0, input.eventsOnLastDay - input.rolledOnLastDay);
  const eventDay = dayStart(lastEventAt);
  const bucketDay = lastBucketStart ? dayStart(lastBucketStart) : null;

  // Whole days uncovered. The rollups do not merely trail the newest batch,
  // they end before the traffic does.
  if (bucketDay === null || bucketDay < eventDay) {
    const coveredThrough = bucketDay === null ? null : new Date(bucketDay + DAY_MS).toISOString();
    return {
      state: "stale",
      lastEventAt,
      lastBucketStart,
      dataAsOf: coveredThrough,
      lagMs: Date.parse(lastEventAt) - (bucketDay === null ? Date.parse(lastEventAt) : bucketDay + DAY_MS),
      missingRequests,
      missingDays: Math.max(input.missingDays, 1),
    };
  }

  if (missingRequests === 0) {
    return {
      state: "ok",
      lastEventAt,
      lastBucketStart,
      dataAsOf: lastEventAt,
      lagMs: 0,
      missingRequests: 0,
      missingDays: 0,
    };
  }

  /*
   * A batch that landed seconds ago may legitimately not be rolled up in the
   * instant between the event write and the rebuild that follows it. That is a
   * settling window, not a fault — but it is bounded, and past the bound the
   * same shortfall is reported as the real gap it is.
   */
  const age = now - Date.parse(lastEventAt);
  const settling = age <= ROLLUP_LAG_TOLERANCE_MS;

  return {
    state: settling ? "settling" : "partial",
    lastEventAt,
    lastBucketStart,
    // The day is only partly rolled up, so the figures are honest only up to
    // the start of that day.
    dataAsOf: new Date(eventDay).toISOString(),
    lagMs: Date.parse(lastEventAt) - eventDay,
    missingRequests,
    missingDays: input.missingDays,
  };
}

/** True when the customer must be told the figures are not complete. */
export function coverageIsFaulty(c: RollupCoverage): boolean {
  return c.state === "partial" || c.state === "stale";
}

/** One sentence, in the customer's terms, for a faulty coverage reading. */
export function coverageCopy(c: RollupCoverage): string {
  if (c.state === "stale") {
    return c.lastBucketStart
      ? `We hold traffic newer than the figures below. Everything here is complete only through ${new Date(
          c.dataAsOf ?? c.lastBucketStart,
        ).toUTCString()} — later events have arrived but are not yet counted, so every spend and saving figure understates.`
      : `We hold traffic that has never been counted. Nothing below includes it, so every spend and saving figure understates.`;
  }
  return `${c.missingRequests.toLocaleString()} request${
    c.missingRequests === 1 ? "" : "s"
  } that reached us today are not yet counted in the figures below, so today understates.`;
}
