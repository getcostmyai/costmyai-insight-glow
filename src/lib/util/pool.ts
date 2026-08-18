/**
 * Bounded-concurrency map.
 *
 * Deliberately not `Promise.all` over the whole list: the jobs this backs hit
 * the database once per workspace, and an unbounded fan-out at a thousand
 * workspaces would replace a slow sweep with an exhausted connection pool —
 * a worse outage than the one it was meant to prevent.
 *
 * Results keep input order regardless of completion order, so a caller can
 * still line a result up with the workspace it came from.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const width = Math.max(1, Math.min(Math.floor(limit) || 1, items.length || 1));
  const out = new Array<R>(items.length);
  let next = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]!, i);
    }
  };

  await Promise.all(Array.from({ length: width }, worker));
  return out;
}
