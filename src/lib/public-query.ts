import type { QueryClient, UseQueryOptions } from "@tanstack/react-query";

/**
 * Loader entry point for every public route that waits on data.
 *
 * Two jobs. First, the read itself already degrades server-side, but the
 * transport can fail outright, and TanStack Query's default retry then turns a
 * 3s failure into a ~19s one before the route finally renders an error page.
 * So public queries set `retry: false` and this helper catches whatever is
 * left. Second, it seeds the cache with a resolvable empty value, so the
 * page's `useSuspenseQuery` renders its shell with figures absent rather than
 * leaving the document request unanswered or surfacing the generic error page.
 */
export async function ensurePublicQuery<T>(
  queryClient: QueryClient,
  // The query-options object produced by `queryOptions(...)`.
  options: { queryKey: readonly unknown[] } & Record<string, unknown>,
  fallback: T,
  label: string,
): Promise<T> {
  try {
    return (await queryClient.ensureQueryData(
      options as unknown as UseQueryOptions<T> & { queryKey: readonly unknown[] },
    )) as T;
  } catch (err) {
    console.error(`[${label}] loader degraded:`, err instanceof Error ? err.message : err);
    queryClient.setQueryData(options.queryKey, fallback);
    return fallback;
  }
}
