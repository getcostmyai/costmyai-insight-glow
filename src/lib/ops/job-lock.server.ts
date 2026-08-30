import { adminClient } from "@/lib/ingest/ingest.server";

/**
 * Single-flight for scheduled jobs.
 *
 * Standing policy: a job that repairs data must never run twice at once. The
 * lock is held in Postgres rather than in a process, because there is no
 * process to hold it in — each run is a fresh serverless invocation, and two
 * invocations of the same schedule can overlap whenever one pass runs long.
 *
 * A plain `pg_advisory_lock` would be the obvious tool and is the wrong one
 * here: advisory locks live on a *session*, and every statement we issue goes
 * through a pooled connection that may not be the same session as the last.
 * The lease below gives the same guarantee with the pooling we actually have —
 * one holder at a time, taken atomically in a single `INSERT ... ON CONFLICT`,
 * and self-releasing after `ttlSeconds` so a crashed run cannot wedge the
 * schedule permanently.
 */

export interface JobLock {
  job: string;
  token: string;
  release: () => Promise<void>;
}

/** Take the lock, or return null when another run already holds it. */
export async function acquireJobLock(job: string, ttlSeconds = 900): Promise<JobLock | null> {
  const db = adminClient();
  const { data, error } = await db.rpc(
    "job_lock_acquire" as never,
    {
      _job: job,
      _ttl_seconds: ttlSeconds,
    } as never,
  );
  if (error) throw new Error(`could not take the ${job} lock: ${error.message}`);
  const token = (data as string | null) ?? null;
  if (!token) return null;

  return {
    job,
    token,
    release: async () => {
      await db.rpc("job_lock_release" as never, { _job: job, _token: token } as never);
    },
  };
}

/**
 * Run `fn` under the lock. Returns `{ ran: false }` — not an error — when
 * another run holds it: an overlapping schedule tick is a no-op, not a fault.
 */
export async function withJobLock<T>(
  job: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<{ ran: true; result: T } | { ran: false; result: null }> {
  const lock = await acquireJobLock(job, ttlSeconds);
  if (!lock) return { ran: false, result: null };
  try {
    return { ran: true, result: await fn() };
  } finally {
    await lock.release().catch(() => undefined);
  }
}
