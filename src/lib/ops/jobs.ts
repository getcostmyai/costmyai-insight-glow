/**
 * Every scheduled job that actually exists, and what "healthy" means for it.
 *
 * One list, used by both the on-demand audit script and the internal jobs
 * board, so a job cannot be watched in one place and forgotten in the other.
 * `maxIntervalMinutes` is the schedule plus a real tolerance: past it, silence
 * is a fault rather than a job that has not come round yet.
 */

export interface JobSpec {
  /** The value written to `sync_runs.job`. */
  job: string;
  label: string;
  /** The pg_cron entry that drives it. */
  cronName: string;
  schedule: string;
  /** Longest gap between runs that is still normal, including tolerance. */
  maxIntervalMinutes: number;
  what: string;
  /**
   * A watch, not a schedule: it only writes a row when it has something to
   * report. Silence is the healthy state, so it is never judged stale, and a
   * single reported row is the alert. Used for the unrecognised-shape watch,
   * which fires from ingest and from the pricing feed rather than from cron.
   */
  eventDriven?: boolean;
  /** What silence means, printed when an event-driven watch has nothing to say. */
  quietMeans?: string;
}


/**
 * The one job name the shape watch writes under. Ingest and the pricing sync
 * both report here rather than each inventing a channel, so the board shows
 * one line for "a shape we do not understand turned up".
 */
export const SHAPE_WATCH_JOB = "shape-watch";

/** How long a reported shape stays an open alert on the board. */
export const SHAPE_WATCH_WINDOW_MINUTES = 7 * 24 * 60;

export const JOB_REGISTRY: JobSpec[] = [
  {
    job: "usage-tick",
    label: "Usage collection",
    cronName: "costmyai-synthetic-tick",
    schedule: "* * * * *",
    maxIntervalMinutes: 15,
    what: "Writes the usage events every projection and recommendation is computed from.",
  },
  {
    job: "pricing-sync",
    label: "Pricing sync",
    cronName: "costmyai-pricing-sync",
    schedule: "*/3 * * * *",
    maxIntervalMinutes: 30,
    what: "Refreshes host prices and re-runs the engine when a price moves.",
  },
  {
    job: "benchmark-sync",
    label: "Benchmark sync",
    cronName: "costmyai-benchmark-sync",
    schedule: "17 3 * * *",
    maxIntervalMinutes: 60 * 30,
    what: "Pulls measured benchmark scores and margins, then re-runs the engine.",
  },
  {
    job: "dr-backup-export",
    label: "Off-platform backup",
    cronName: "costmyai-dr-backup-export",
    schedule: "25 */6 * * *",
    maxIntervalMinutes: 60 * 9,
    what: "Restores the irreplaceable tables into the independent Neon project.",
  },
  {
    job: "partner-payouts",
    label: "Partner payouts",
    cronName: "costmyai-partner-payouts",
    schedule: "0 6 1 * *",
    maxIntervalMinutes: 60 * 24 * 35,
    what: "Pays every partner carrying commission above the minimum.",
  },
  {
    job: "freeze-intelligence",
    label: "Month-end freeze",
    cronName: "freeze-intelligence-monthly",
    schedule: "0 0 1 * *",
    maxIntervalMinutes: 60 * 24 * 35,
    what: "Freezes the closing month's public intelligence figures, append-only.",
  },
  {
    job: "parser-reprocess",
    label: "Retroactive reprocessing",
    cronName: "costmyai-parser-reprocess",
    schedule: "40 * * * *",
    maxIntervalMinutes: 180,
    what: "Re-reads events metered by an older response parser when a new shape parser ships, and rebuilds the rollups they touched.",
  },
  {
    job: "schema-filters",
    label: "Schema-filter check",
    cronName: "costmyai-schema-filters",
    schedule: "10 4 * * *",
    maxIntervalMinutes: 60 * 30,
    what: "Re-checks every read query against the lifecycle and tenancy columns the database actually carries today, and promotes a finding the moment a dormant guard goes live.",
  },
  {
    job: "intelligence-leads",
    label: "Intelligence lead detector",
    cronName: "costmyai-intelligence-leads",
    schedule: "50 5 * * *",
    maxIntervalMinutes: 60 * 30,
    what: "Scans the price, benchmark and listing ledgers for something worth writing about, and files it in the editorial queue with its evidence attached.",
  },
  {
    job: "task-drift",
    label: "Token-drift meter",
    cronName: "costmyai-task-drift",
    schedule: "30 2 1 * *",
    maxIntervalMinutes: 60 * 24 * 35,
    what: "Sends eight frozen tasks to six pinned models and records the token counts each provider billed, so that a fixed workload getting quietly more expensive is measured rather than argued.",
  },
  {


    job: SHAPE_WATCH_JOB,
    label: "Unrecognised response shapes",
    cronName: "—",
    schedule: "on event",
    // Never judged on cadence: see `eventDriven`. Kept large so a stray read
    // of this field by an older caller cannot invent a staleness alert.
    maxIntervalMinutes: Number.MAX_SAFE_INTEGER,
    eventDriven: true,
    what: "Reports a provider response envelope the connector could not read, and a provider appearing on the pricing feed with no known shape.",
    quietMeans: "Every shape seen so far is one of the six the connector parses.",
  },
  {
    job: "switch-auto-pause",
    label: "Switch auto-pause",
    cronName: "—",
    schedule: "on event",
    maxIntervalMinutes: Number.MAX_SAFE_INTEGER,
    eventDriven: true,
    what: "Reports a live switch paused automatically after repeated rerouting fallbacks, so a switch that keeps sending traffic back to where it started stops running unattended.",
    quietMeans: "No workspace has hit the fallback threshold on a live switch.",
  },
];


export type JobVerdict = "healthy" | "stale" | "failing" | "empty" | "never-run";

export interface JobRunSummary {
  outcome: string | null;
  startedAt: string;
  rowsWritten: number | null;
  error: string | null;
}

export interface JobHealth extends JobSpec {
  lastRunAt: string | null;
  minutesSince: number | null;
  verdict: JobVerdict;
  /** Plain-English reason, safe to print or render as-is. */
  reason: string;
  recent: JobRunSummary[];
}

const MIN_MS = 60_000;

/**
 * Judge one job from its own recent runs.
 *
 * The order matters and is deliberate: a job that has not fired is judged on
 * silence before anything it once reported, because a stale "ok" is exactly the
 * shape the 1 August usage incident took.
 */
export function judgeJob(spec: JobSpec, runs: JobRunSummary[], nowMs: number): JobHealth {
  const recent = [...runs].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)).slice(0, 20);
  const last = recent[0] ?? null;
  const lastRunAt = last?.startedAt ?? null;
  const minutesSince = lastRunAt ? Math.round((nowMs - Date.parse(lastRunAt)) / MIN_MS) : null;

  const base = { ...spec, lastRunAt, minutesSince, recent };

  /**
   * A watch is the inverse of a schedule: it writes only when something is
   * wrong, so silence is the healthy answer and staleness is meaningless. An
   * alert stays open for a week, long enough that nobody misses one raised on
   * a Friday, then clears itself rather than staying red forever.
   */
  if (spec.eventDriven) {
    const open = recent.filter(
      (r) =>
        r.outcome !== "quiet" &&
        (nowMs - Date.parse(r.startedAt)) / MIN_MS <= SHAPE_WATCH_WINDOW_MINUTES,
    );
    if (open.length === 0) {
      return {
        ...base,
        verdict: "healthy",
        reason: lastRunAt
          ? `Nothing reported in the last ${formatAgo(SHAPE_WATCH_WINDOW_MINUTES)}. ${spec.quietMeans ?? ""}`.trim()
          : (spec.quietMeans ?? "Nothing reported."),
      };
    }
    return {
      ...base,
      verdict: "failing",
      reason: `${open.length} report${open.length === 1 ? "" : "s"} in the last ${formatAgo(
        SHAPE_WATCH_WINDOW_MINUTES,
      )}: ${String(open[0]?.error ?? "no detail").slice(0, 200)}`,
    };
  }

  if (!last || minutesSince === null) {
    return { ...base, verdict: "never-run", reason: "This job has never reported a run." };
  }

  if (minutesSince > spec.maxIntervalMinutes) {
    return {
      ...base,
      verdict: "stale",
      reason: `Last run ${formatAgo(minutesSince)} ago — past the ${formatAgo(spec.maxIntervalMinutes)} this schedule allows.`,
    };
  }
  const window = recent.slice(0, 3);
  if (window.length > 0 && window.every((r) => r.outcome === "failed")) {
    return {
      ...base,
      verdict: "failing",
      reason: window[0]?.error
        ? `Failing: ${String(window[0].error).slice(0, 160)}`
        : "The last runs all failed.",
    };
  }
  if (last.outcome === "empty") {
    return {
      ...base,
      verdict: "empty",
      reason: "The last run finished without writing anything it was expected to write.",
    };
  }
  return { ...base, verdict: "healthy", reason: `Last run ${formatAgo(minutesSince)} ago.` };
}

export function formatAgo(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 60 * 48) return `${Math.round(minutes / 60)} h`;
  return `${Math.round(minutes / (60 * 24))} d`;
}

export const UNHEALTHY: JobVerdict[] = ["stale", "failing", "empty", "never-run"];
