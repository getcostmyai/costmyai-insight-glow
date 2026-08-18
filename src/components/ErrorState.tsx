import { AlertTriangle, Loader2, LockKeyhole, RefreshCw } from "lucide-react";

import { describeError, type DescribedError } from "@/lib/errors";

/**
 * The visible admission.
 *
 * Anywhere a read can fail, this renders instead of the empty state. An empty
 * list on a failed query reads as a real, checkable answer ("you have no
 * invoices") when it is actually "we don't know" — the worst failure mode this
 * product has. This component exists so that never happens quietly.
 */
export function ErrorState({
  error,
  onRetry,
  retrying = false,
  compact = false,
  className = "",
}: {
  error: unknown;
  onRetry?: () => void;
  retrying?: boolean;
  /** Inline variant for a single panel rather than a whole page area. */
  compact?: boolean;
  className?: string;
}) {
  const described: DescribedError = describeError(error);
  const Icon = described.kind === "forbidden" || described.kind === "unauthorized" ? LockKeyhole : AlertTriangle;

  return (
    <div
      role="alert"
      data-testid="error-state"
      data-error-kind={described.kind}
      className={`rounded-2xl border border-destructive/40 bg-destructive/5 ${
        compact ? "p-5" : "p-8"
      } ${className}`}
    >
      <div className="flex items-start gap-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className={`font-semibold ${compact ? "text-sm" : "text-base"}`}>{described.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{described.message}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            {described.retryable && onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                disabled={retrying}
                data-testid="error-retry"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {retrying ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                Try again
              </button>
            ) : null}
            {described.kind === "unauthorized" ? (
              <a
                href="/auth"
                className="inline-flex items-center rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium transition-colors hover:bg-accent"
              >
                Sign in again
              </a>
            ) : null}
            {described.kind === "forbidden" ? (
              <a
                href="/workspace"
                className="inline-flex items-center rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium transition-colors hover:bg-accent"
              >
                Go to my workspace
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
