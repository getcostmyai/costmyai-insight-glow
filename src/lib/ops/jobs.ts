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
}

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
