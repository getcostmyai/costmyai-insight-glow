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

/**
 * Same lease, different waiting policy.
 *
 * `acquireJobLock`/`withJobLock` treat "someone else holds it" as a no-op —
 * correct for a cron tick, where a skipped overlap costs nothing because the
 * next tick repeats the whole sweep anyway. It is the wrong policy for a
 * request-triggered read-compute-write (Dispatch 267): `rebuildRollups` and
 * `recomputeSwitchSavings` are each called with a real batch of newly-ingested
 * traffic behind them, and that traffic does not get re-offered later. Skipping
 * the second caller instead of waiting for the first would mean its rollup /
 * saved_usd write never happens until some unrelated future call for the same
 * org rebuilds from scratch — which can be arbitrarily far away for a
 * low-traffic workspace, wrong as a general answer even though the eventual
 * self-heal makes it easy to miss.
 *
 * So this variant blocks: poll the lease until it is free or `maxWaitMs`
 * elapses, then run `fn` holding it. Two callers for the same key are
 * serialised rather than one being dropped — the second caller's read always
 * starts after the first caller's write has committed and its lease is
 * released, so it always computes from a superset of what the first call saw.
 * That ordering guarantee — not merely "no crash" — is what closes the lost-
 * update race: whichever call finishes last re-derives the full state from
 * scratch (rollups and saved_usd are both re-derived, never incremented), so
 * the last writer can only ever be as complete as, or more complete than, the
 * one before it. No writer can silently revert another's committed traffic.
 */
export async function acquireJobLockBlocking(
  key: string,
  opts: { ttlSeconds?: number; maxWaitMs?: number; pollMs?: number } = {},
): Promise<JobLock> {
  const ttlSeconds = opts.ttlSeconds ?? 60;
  const maxWaitMs = opts.maxWaitMs ?? 30_000;
  const pollMs = opts.pollMs ?? 100;
  const deadline = Date.now() + maxWaitMs;

  for (;;) {
    const lock = await acquireJobLock(key, ttlSeconds);
    if (lock) return lock;
    if (Date.now() >= deadline) {
      throw new Error(
        `timed out waiting for the ${key} lock after ${maxWaitMs}ms — another writer held it the whole time`,
      );
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

/** Run `fn` holding the lock, waiting for a concurrent holder to finish rather than skipping. */
export async function withJobLockBlocking<T>(
  key: string,
  fn: () => Promise<T>,
  opts: { ttlSeconds?: number; maxWaitMs?: number; pollMs?: number } = {},
): Promise<T> {
  const lock = await acquireJobLockBlocking(key, opts);
  try {
    return await fn();
  } finally {
    await lock.release().catch(() => undefined);
  }
}
