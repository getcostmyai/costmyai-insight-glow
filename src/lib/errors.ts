/**
 * One place that turns a thrown thing into words a customer can act on.
 *
 * The rule this file exists to enforce: never let a refusal we *do* understand
 * (no access to this workspace, session expired, plan not entitled) render as
 * the anonymous "something went wrong" card. An access denial is an answer;
 * an unknown failure is an admission — they must not look the same.
 */

export type ErrorKind = "forbidden" | "unauthorized" | "notFound" | "network" | "unknown";

export type DescribedError = {
  kind: ErrorKind;
  title: string;
  message: string;
  /** A retry only helps when the failure could plausibly be transient. */
  retryable: boolean;
};

function textOf(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return `${error.message}`;
  if (error && typeof error === "object" && "message" in error)
    return String((error as { message: unknown }).message ?? "");
  return "";
}

function statusOf(error: unknown): number | null {
  if (error && typeof error === "object") {
    const candidate = error as { status?: unknown; statusCode?: unknown; response?: { status?: unknown } };
    for (const value of [candidate.status, candidate.statusCode, candidate.response?.status]) {
      if (typeof value === "number") return value;
    }
  }
  const text = textOf(error);
  const match = /\b(401|403|404|408|429|5\d\d)\b/.exec(text);
  return match ? Number(match[1]) : null;
}

export function describeError(error: unknown): DescribedError {
  const text = textOf(error);
  const status = statusOf(error);
  const lower = text.toLowerCase();

  if (status === 403 || lower.includes("forbidden") || lower.includes("not allowed")) {
    return {
      kind: "forbidden",
      title: "You don't have access to this workspace",
      message:
        "Your account is signed in, but it isn't a member of this workspace. Ask an owner to invite you, or switch to a workspace you belong to.",
      retryable: false,
    };
  }

  if (status === 401 || lower.includes("unauthorized") || lower.includes("jwt expired")) {
    return {
      kind: "unauthorized",
      title: "Your session expired",
      message: "Sign in again to pick up where you left off. Nothing was lost.",
      retryable: false,
    };
  }

  if (status === 404 || lower.includes("not found")) {
    return {
      kind: "notFound",
      title: "We couldn't find that",
      message: "The thing you asked for isn't there any more, or the link is wrong.",
      retryable: false,
    };
  }

  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("load failed") ||
    lower.includes("timeout") ||
    status === 408
  ) {
    return {
      kind: "network",
      title: "We couldn't reach the server",
      message:
        "The request didn't complete, so nothing below is a real answer. Check your connection and try again.",
      retryable: true,
    };
  }

  return {
    kind: "unknown",
    title: "This didn't load",
    message:
      "Something failed on our end, so we can't show you a trustworthy answer here. Trying again usually works.",
    retryable: true,
  };
}
