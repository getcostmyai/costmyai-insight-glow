/**
 * Paged reads for the catalogue tables.
 *
 * PostgREST enforces a server-side page ceiling of 1000 rows and silently
 * truncates anything larger — `.limit(50_000)` does not raise it, it just
 * looks like it did. The live price table passed 1000 rows, so every
 * full-catalogue read started returning a partial market with no error: the
 * engine stopped seeing whole hosts, and the synthetic tick began refusing to
 * size workloads whose price had simply fallen off the first page.
 *
 * Every read of `host_prices`, `model_catalog`, `benchmarks` and
 * `benchmark_margins` goes through here instead, walking pages until the table
 * is exhausted. A short page means the end of the table, which is the only
 * honest stop condition.
 */

const PAGE = 1000;

export interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

/**
 * Walk every page of a query. `build` receives an inclusive row range and must
 * return the same query with `.range(from, to)` applied.
 */
export async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<PageResult<T>>,
  { pageSize = PAGE, maxPages = 200 }: { pageSize?: number; maxPages?: number } = {},
): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize;
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) return rows;
  }
  throw new Error(`Refusing to page past ${maxPages * pageSize} rows — the catalogue read looks unbounded.`);
}
