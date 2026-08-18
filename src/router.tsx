import { QueryClient } from "@tanstack/react-query";
import { createRouter, useRouter } from "@tanstack/react-router";

import { ErrorState } from "@/components/ErrorState";
import { routeTree } from "./routeTree.gen";

/**
 * The default a route gets when it says nothing.
 *
 * Every route now has a real loading and a real failure state without opting
 * in; surfaces whose generic default isn't good enough (the dashboard) still
 * override it locally.
 */
function DefaultPending() {
  return (
    <div
      role="status"
      aria-busy="true"
      data-testid="route-pending"
      className="mx-auto w-full max-w-3xl px-6 py-24"
    >
      <div className="h-3 w-28 animate-pulse rounded-md bg-muted" />
      <div className="mt-5 h-8 w-2/3 animate-pulse rounded-md bg-muted" />
      <div className="mt-3 h-3 w-full animate-pulse rounded-md bg-muted" />
      <div className="mt-2 h-3 w-4/5 animate-pulse rounded-md bg-muted" />
      <div className="mt-10 h-40 w-full animate-pulse rounded-2xl bg-muted" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

function DefaultError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-24">
      <ErrorState
        error={error}
        onRetry={() => {
          router.invalidate();
          reset();
        }}
      />
    </div>
  );
}

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultPendingComponent: DefaultPending,
    defaultErrorComponent: DefaultError,
  });

  return router;
};
