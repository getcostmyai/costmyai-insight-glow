import {
  BACKFILL_LOOKBACK_DAYS,
  captureIdempotencyKey,
  ROLLING_WINDOW_DAYS,
} from "./contract";

/**
 * First-connection backfill planning (brief §1, data sources).
 *
 * Pure logic, deliberately: the customer's container runs it to decide which
 * invoice periods to fetch, and the tests run the exact same function. The
 * rule is simple — the first poll after a provider is connected looks back 30
 * days so a new workspace shows a real reconciled month on day one; every poll
 * after that reverts to the short rolling window, because old invoices don't
 * change and re-pulling them is just noise.
 *
 * Everything downstream is idempotent on (org, provider, period_start,
 * period_end), so a reconnect, a retry or an overlapping window cannot
 * double-count. A provider whose own invoice history is shorter than the
 * lookback produces a coverage note, never a silently truncated month.
 */

const DAY_MS = 86_400_000;

export interface ProviderConnectionState {
  provider: string;
  /** Null/absent means the provider has never been polled — this is the first poll. */
  lastPolledAt?: string | null;
  /** How far back this provider exposes invoices, when it caps below the lookback. */
  historyDays?: number | null;
}

export interface BillingPeriod {
  provider: string;
  /** Inclusive first day of the invoice period, YYYY-MM-DD. */
  periodStart: string;
  /** Exclusive last day, YYYY-MM-DD — so consecutive periods never overlap. */
  periodEnd: string;
  idempotencyKey: string;
}

export interface BillingPollPlan {
  provider: string;
  isFirstPoll: boolean;
  /** What we asked for. */
  requestedLookbackDays: number;
  /** What the provider can actually give us. */
  effectiveLookbackDays: number;
  periods: BillingPeriod[];
  /** Present only when the provider's history is shorter than the lookback. */
  coverageNote?: string;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function monthStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function nextMonthStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}

/**
 * Split a window into calendar-month segments, because that is the unit
 * providers invoice in. A window spanning a month boundary yields two periods,
 * each clipped to the window, so the estimate we compare against covers exactly
 * the days the invoice does.
 */
export function splitIntoInvoicePeriods(provider: string, from: Date, toExclusive: Date): BillingPeriod[] {
  const periods: BillingPeriod[] = [];
  let cursor = utcDay(from);
  const end = utcDay(toExclusive);
  while (cursor < end) {
    const segmentEnd = new Date(Math.min(nextMonthStart(cursor).getTime(), end.getTime()));
    const periodStart = isoDay(cursor);
    const periodEnd = isoDay(segmentEnd);
    periods.push({
      provider,
      periodStart,
      periodEnd,
      idempotencyKey: captureIdempotencyKey(provider, periodStart, periodEnd),
    });
    cursor = segmentEnd;
  }
  return periods;
}

export function planBillingPoll(state: ProviderConnectionState, now: Date): BillingPollPlan {
  const isFirstPoll = !state.lastPolledAt;
  const requested = isFirstPoll ? BACKFILL_LOOKBACK_DAYS : ROLLING_WINDOW_DAYS;
  const cap = state.historyDays ?? null;
  const effective = cap === null ? requested : Math.max(0, Math.min(requested, cap));

  const toExclusive = new Date(utcDay(now).getTime() + DAY_MS);
  const from = new Date(toExclusive.getTime() - effective * DAY_MS);
  const periods = effective > 0 ? splitIntoInvoicePeriods(state.provider, from, toExclusive) : [];

  const plan: BillingPollPlan = {
    provider: state.provider,
    isFirstPoll,
    requestedLookbackDays: requested,
    effectiveLookbackDays: effective,
    periods,
  };

  if (effective < requested) {
    plan.coverageNote =
      effective === 0
        ? `${state.provider} exposes no invoice history through its API — reconciliation starts from the first invoice issued after connection.`
        : `${state.provider} exposes only ${effective} days of invoice history; the first ${requested - effective} days of the requested ${requested}-day backfill are not available from the provider.`;
  }

  return plan;
}

/** State to persist after a completed poll, so the next one uses the rolling window. */
export function advanceConnectionState(
  state: ProviderConnectionState,
  polledAt: Date,
): ProviderConnectionState {
  return { ...state, lastPolledAt: polledAt.toISOString() };
}

/** Convenience for the container: months a first poll would ask for, oldest first. */
export function backfillPeriods(provider: string, now: Date, historyDays?: number | null): BillingPeriod[] {
  return planBillingPoll({ provider, historyDays }, now).periods;
}

/** Days a period covers — the window the estimate must be summed over. */
export function periodDayCount(period: BillingPeriod): number {
  return Math.round(
    (Date.parse(`${period.periodEnd}T00:00:00Z`) - Date.parse(`${period.periodStart}T00:00:00Z`)) / DAY_MS,
  );
}
