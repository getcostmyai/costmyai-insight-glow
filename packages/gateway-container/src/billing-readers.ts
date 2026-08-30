import type { BillingPeriod } from "../../../src/lib/ingest/backfill.js";
import type { InvoiceReader } from "./billing-poll.js";

/**
 * Provider invoice readers, run inside the customer's own container with the
 * customer's own billing credential. The credential never leaves that process;
 * only the invoiced TOTAL for a period is ever handed to `pollProvider`.
 *
 * Only OpenAI is implemented. Every other provider returns `null` — no reader
 * at all — rather than a plausible-looking stub, because a reader that
 * silently returns zero would show a customer a reconciled invoice they never
 * actually had.
 *
 * HONESTY NOTE: the OpenAI Costs API request shape and response JSON field
 * names below (`/v1/organization/costs`, `data[].results[].amount.value`,
 * `has_more`, `next_page`) are built from documented API knowledge and have
 * NOT been verified against a live OpenAI Admin key. If the live shape differs,
 * this reader returns null for the period and the period is reported as
 * uncovered — which is the honest failure, not a fabricated total.
 */

export const OPENAI_COSTS_URL = "https://api.openai.com/v1/organization/costs";

/** OpenAI's Costs API exposes roughly a year; well beyond our 30-day lookback. */
const OPENAI_HISTORY_DAYS = 365;

const DAY_MS = 86_400_000;

function unixDay(isoDay: string): number {
  return Math.floor(Date.parse(`${isoDay}T00:00:00Z`) / 1000);
}

type CostsBucket = {
  results?: Array<{ amount?: { value?: number; currency?: string } | null } | null> | null;
};

type CostsPage = {
  data?: CostsBucket[] | null;
  has_more?: boolean | null;
  next_page?: string | null;
};

/**
 * Reads one period's invoiced USD from the OpenAI Costs API.
 *
 * `start_time`/`end_time` are unix seconds, the window is half-open exactly as
 * `BillingPeriod` defines it, and pagination follows `has_more`/`next_page`
 * until exhausted so a long month is never silently truncated to its first
 * page. Any non-2xx, unreadable body, or total that is not a finite number
 * yields `null` — the period is then reported as uncovered upstream rather
 * than as a zero-dollar invoice.
 */
export function createOpenAiInvoiceReader(apiKey: string, fetchImpl: typeof fetch = fetch): InvoiceReader {
  return {
    historyDays: OPENAI_HISTORY_DAYS,
    async read(period: BillingPeriod): Promise<number | null> {
      let page: string | null = null;
      let total = 0;
      let sawAnything = false;
      // Bounded: a runaway `has_more` must not spin forever in a customer's
      // container. 31 days of daily buckets fits comfortably inside this.
      for (let i = 0; i < 50; i += 1) {
        const url = new URL(OPENAI_COSTS_URL);
        url.searchParams.set("start_time", String(unixDay(period.periodStart)));
        url.searchParams.set("end_time", String(unixDay(period.periodEnd)));
        url.searchParams.set("bucket_width", "1d");
        url.searchParams.set("limit", "31");
        if (page) url.searchParams.set("page", page);

        let body: CostsPage;
        try {
          const response = await fetchImpl(url.toString(), {
            method: "GET",
            headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
          });
          if (!response.ok) return null;
          body = (await response.json()) as CostsPage;
        } catch {
          return null;
        }

        for (const bucket of body.data ?? []) {
          for (const result of bucket?.results ?? []) {
            const value = result?.amount?.value;
            if (typeof value !== "number" || !Number.isFinite(value)) continue;
            total += value;
            sawAnything = true;
          }
        }

        if (!body.has_more || !body.next_page) break;
        page = body.next_page;
      }

      if (!sawAnything) return null;
      return Number(total.toFixed(6));
    },
  };
}

/**
 * The reader for a provider, or `null` when we have not implemented one.
 *
 * A null here is load-bearing: `createGateway` builds no scheduler at all, so
 * an Anthropic or Together container behaves byte-identically to one built
 * before billing reconciliation existed.
 */
export function createInvoiceReader(
  provider: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): InvoiceReader | null {
  if (provider.trim().toLowerCase() !== "openai") return null;
  return createOpenAiInvoiceReader(apiKey, fetchImpl);
}

export { DAY_MS };
