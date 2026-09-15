/**
 * Degradation guard for public page reads.
 *
 * A marketing or intelligence page is allowed to wait on the database, but it
 * is never allowed to fail because of it. The rule this module enforces is the
 * same one the product states about its own numbers: a figure we cannot stand
 * behind is shown as absent, never as a guess and never as an error page.
 *
 * Two guarantees:
 *   1. A whole read has a hard deadline, so one slow call cannot hold a
 *      document request open.
 *   2. A failed or late read resolves to the last values this worker actually
 *      saw, flagged `degraded`, or to an empty result that claims nothing.
 */

/** Whole-read deadline, matching the per-request deadline in supabase-public.server.ts. */
export const PUBLIC_READ_TIMEOUT_MS = 3000;

export function withDeadline<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer)) as Promise<T>;
}

/** Last successful read per label. A render fallback only, always served degraded. */
const lastGood = new Map<string, unknown>();

/** Test seam. */
export function __resetPublicReadCache() {
  lastGood.clear();
}

/**
 * Run a public read under a deadline and never reject.
 *
 * On success the value is remembered. On failure or timeout the caller gets the
 * remembered value with `degraded: true`, or `empty` (which must itself claim
 * nothing) when this worker has never completed the read.
 */
export async function degradeRead<T extends object>(
  label: string,
  read: () => Promise<T>,
  empty: T,
  ms: number = PUBLIC_READ_TIMEOUT_MS,
): Promise<T & { degraded?: boolean }> {
  try {
    const fresh = await withDeadline(read(), ms, label);
    lastGood.set(label, fresh);
    return fresh;
  } catch (err) {
    console.error(`[${label}] degraded:`, err instanceof Error ? err.message : err);
    const remembered = lastGood.get(label) as T | undefined;
    return { ...(remembered ?? empty), degraded: true };
  }
}
