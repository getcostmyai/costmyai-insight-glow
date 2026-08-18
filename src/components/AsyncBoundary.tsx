import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { Component, Suspense, type ReactNode } from "react";

import { ErrorState } from "@/components/ErrorState";

type FallbackRender = (props: { error: unknown; retry: () => void }) => ReactNode;

class Catcher extends Component<
  { children: ReactNode; fallback: FallbackRender; onReset: () => void; resetKey?: unknown },
  { error: unknown | null }
> {
  state: { error: unknown | null } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidUpdate(prev: { resetKey?: unknown }) {
    if (this.state.error !== null && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error !== null) {
      return this.props.fallback({
        error: this.state.error,
        retry: () => {
          // Reset TanStack Query's error state first, then drop our own, so the
          // retry re-runs the failed query rather than reloading the document.
          this.props.onReset();
          this.setState({ error: null });
        },
      });
    }
    return this.props.children;
  }
}

/**
 * Loading and failure, scoped to the area that actually failed.
 *
 * Placed around content rather than around the app so the masthead, sidebar
 * and level nav survive a failed read: a customer whose snapshot 500s can
 * still navigate, sign out, or reach Billing.
 */
export function AsyncBoundary({
  pending,
  children,
  fallback,
  resetKey,
}: {
  pending: ReactNode;
  children: ReactNode;
  /** Defaults to the standard error card with a working retry. */
  fallback?: FallbackRender;
  resetKey?: unknown;
}) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <Catcher
          onReset={reset}
          resetKey={resetKey}
          fallback={
            fallback ??
            (({ error, retry }) => <ErrorState error={error} onRetry={retry} />)
          }
        >
          <Suspense fallback={pending}>{children}</Suspense>
        </Catcher>
      )}
    </QueryErrorResetBoundary>
  );
}
