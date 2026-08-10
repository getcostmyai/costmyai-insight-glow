/**
 * Is this workspace still connected?
 *
 * Three different silences, and the dashboard must never show them as one:
 * a workspace that has never ingested (setup), a workspace whose events have
 * simply gone quiet (possible, and honest to say so), and a workspace that
 * *cannot* receive anything because it holds no usable ingest token — the
 * shape a revoked or rotated-and-forgotten token produces. In that last case
 * every figure on screen is history, and saying nothing while the counters
 * tick forward would be a lie the customer has no way to detect.
 *
 * Classification is pure so it can be tested without a database.
 */

export type IngestState = "never" | "live" | "quiet" | "disconnected";

/**
 * How long a connected workspace may go silent before we stop calling it live.
 *
 * Dispatch 170 corrected the reasoning here. The old comment justified 3 hours
 * with "the container polls hourly" — it does not, and never did in shipped
 * config: the flush interval is 30s
 * (packages/gateway-container/src/config.ts). Three hours is therefore not
 * "three missed polls", it is roughly 360 missed flushes.
 *
 * Re-derived honestly, 3h still holds, but for a different reason. The signal
 * is not the flush cadence, it is the *traffic* cadence: a real workspace can
 * legitimately send nothing overnight, between batch jobs, or over a weekend,
 * and the container has nothing to flush when the customer made no calls. The
 * threshold has to be long enough that ordinary quiet traffic is not reported
 * as a broken connection, and short enough that a genuinely dead pipe is
 * caught inside a working day. 3h satisfies both; the flush interval only
 * tells us the lower bound — anything under a few minutes would be noise, not
 * that 3h is right.
 *
 * A tighter number would need a distribution of real customer inter-event gaps
 * to justify, and we do not have one yet. Revisit once there is.
 */
export const QUIET_AFTER_HOURS = 3;

export interface IngestConnection {
  state: IngestState;
  /** Newest event we have actually received, ISO, or null if never. */
  lastEventAt: string | null;
  hoursSinceLastEvent: number | null;
  /** Tokens that would authenticate a push right now. */
  activeTokens: number;
  /** When the most recent token was revoked, if none are active. */
  lastRevokedAt: string | null;
}

export function classifyIngest(input: {
  lastEventAt: string | null;
  activeTokens: number;
  lastRevokedAt: string | null;
  nowMs: number;
}): IngestConnection {
  const { lastEventAt, activeTokens, lastRevokedAt, nowMs } = input;
  const hours = lastEventAt ? (nowMs - Date.parse(lastEventAt)) / 3_600_000 : null;

  const base = {
    lastEventAt,
    hoursSinceLastEvent: hours === null ? null : Math.max(0, hours),
    activeTokens,
    lastRevokedAt,
  };

  // No usable token: nothing can arrive, whatever the chart is showing.
  if (activeTokens === 0) {
    return { ...base, state: lastEventAt ? "disconnected" : "never" };
  }
  if (!lastEventAt) return { ...base, state: "never" };
  return { ...base, state: (hours ?? 0) > QUIET_AFTER_HOURS ? "quiet" : "live" };
}
