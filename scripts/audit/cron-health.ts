#!/usr/bin/env bun
/**
 * Check 3 — cron-job health, every job.
 *
 * Reads the run ledger and judges each job in `JOB_REGISTRY` on its own
 * schedule: last N outcomes, when it last fired, and whether silence has gone
 * past what that schedule allows. A job that stops firing is the failure mode
 * that hides best, so absence is judged before anything the job once reported.
 *
 *   bun scripts/audit/cron-health.ts
 *   bun scripts/audit/cron-health.ts --runs 10
 *
 * Exit 1 if any job is stale, failing, empty, or has never run.
 */
import { execFileSync } from "node:child_process";
import { JOB_REGISTRY, judgeJob, UNHEALTHY, type JobRunSummary } from "../../src/lib/ops/jobs";

const runsArgIndex = process.argv.indexOf("--runs");
const RUNS = runsArgIndex > -1 ? Number(process.argv[runsArgIndex + 1]) || 5 : 5;

function psql(sql: string): string[][] {
  const out = execFileSync("psql", ["-At", "-F", "\u0001", "-c", sql], { encoding: "utf8" });
  return out
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => l.split("\u0001"));
}

const jobs = JOB_REGISTRY.map((j) => `'${j.job}'`).join(",");
const rows = psql(`
  select job, started_at, coalesce(outcome, ''), coalesce(rows_written::text, ''), coalesce(left(error, 200), '')
  from (
    select job, started_at, outcome, rows_written, error,
           row_number() over (partition by job order by started_at desc) as rn
    from public.sync_runs
    where job in (${jobs})
  ) t
  where rn <= 20
  order by job, started_at desc
`);

const byJob = new Map<string, JobRunSummary[]>();
for (const [job, startedAt, outcome, rowsWritten, error] of rows) {
  if (!job || !startedAt) continue;
  byJob.set(job, [
    ...(byJob.get(job) ?? []),
    {
      startedAt,
      outcome: outcome || null,
      rowsWritten: rowsWritten === "" ? null : Number(rowsWritten),
      error: error || null,
    },
  ]);
}

const now = Date.now();
const health = JOB_REGISTRY.map((spec) => judgeJob(spec, byJob.get(spec.job) ?? [], now));
const bad = health.filter((h) => UNHEALTHY.includes(h.verdict));

console.log("Cron-job health");
console.log("---------------");
console.log(`jobs tracked: ${health.length}   unhealthy: ${bad.length}   shown per job: ${RUNS}`);
console.log("");

for (const h of health) {
  console.log(`${h.verdict.toUpperCase().padEnd(10)} ${h.label}  (${h.job}, ${h.schedule})`);
  console.log(`           ${h.reason}`);
  const recent = h.recent.slice(0, RUNS);
  if (!recent.length) console.log("           no runs on record");
  for (const r of recent) {
    console.log(
      `           ${r.startedAt.slice(0, 19).replace("T", " ")}  ${(r.outcome ?? "legacy").padEnd(7)} rows=${
        r.rowsWritten ?? "?"
      }${r.error ? `  ${r.error.slice(0, 80)}` : ""}`,
    );
  }
  console.log("");
}

console.log(bad.length ? `RESULT: ${bad.map((b) => b.job).join(", ")} need attention.` : "RESULT: all jobs healthy.");
process.exit(bad.length ? 1 : 0);
