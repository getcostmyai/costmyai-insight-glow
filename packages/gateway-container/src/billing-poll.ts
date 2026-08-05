import {
  advanceConnectionState,
  planBillingPoll,
  type BillingPeriod,
  type ProviderConnectionState,
} from "../../../src/lib/ingest/backfill.js";
import type { UpstreamQueue } from "./queue.js";

/**
 * Provider billing poll — runs in the customer's container, with the customer's
 * own provider credentials. Those credentials never leave their environment;
 * we receive the invoiced total and nothing else (zero-credentials
 * architecture, brief §1).
 *
 * First poll after a provider is connected: 30-day lookback, so the workspace
 * shows a real reconciled month on day one. Every poll after that: the short
 * rolling window, because settled invoices don't change.
 */

export interface InvoiceReader {
  /** How far back this provider exposes invoices, if it caps below 30 days. */
  historyDays?: number | null;
  /** Reads one period's invoiced total locally. Returns null if unavailable. */
  read(period: BillingPeriod): Promise<number | null>;
}

export interface PollResult {
  provider: string;
  isFirstPoll: boolean;
  lookbackDays: number;
  captures: number;
  coverageNotes: string[];
  state: ProviderConnectionState;
}

export async function pollProvider(
  state: ProviderConnectionState,
  reader: InvoiceReader,
  queue: UpstreamQueue,
  now: Date = new Date(),
): Promise<PollResult> {
  const plan = planBillingPoll({ ...state, historyDays: reader.historyDays ?? state.historyDays }, now);
  const coverageNotes = plan.coverageNote ? [plan.coverageNote] : [];

  const captures = [] as Array<Record<string, unknown>>;
  for (const period of plan.periods) {
    const invoiced = await reader.read(period);
    if (invoiced === null) {
      coverageNotes.push(
        `${plan.provider} returned no invoice for ${period.periodStart} → ${period.periodEnd}; that period is reported as uncovered rather than assumed to be zero.`,
      );
      continue;
    }
    captures.push({
      provider: plan.provider,
      period_start: period.periodStart,
      period_end: period.periodEnd,
      invoiced_usd: invoiced,
      currency: "USD",
      idempotency_key: period.idempotencyKey,
      ...(plan.coverageNote ? { coverage_note: plan.coverageNote } : {}),
    });
  }

  if (captures.length > 0) {
    // Queued, not awaited on any inference path: if CostMyAI is unreachable the
    // captures sit locally and go up on the next drain.
    queue.enqueue({ kind: "billing", body: { backfill: plan.isFirstPoll, captures } });
  }

  return {
    provider: plan.provider,
    isFirstPoll: plan.isFirstPoll,
    lookbackDays: plan.effectiveLookbackDays,
    captures: captures.length,
    coverageNotes,
    state: advanceConnectionState(state, now),
  };
}
