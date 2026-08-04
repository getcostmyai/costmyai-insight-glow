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
 * The container polls hourly (INGEST_POLL_INTERVAL). Three missed polls is the
 * point where "the provider was slow" stops being the likely explanation.
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
