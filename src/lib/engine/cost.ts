import type { PriceRow, UsageAggregate } from "./types";

export const DAYS_IN_MONTH = 30;

/**
 * THE cost function. Every check in the engine prices through this and nothing
 * else — C3 in the audit was three divergent formulas producing three different
 * "savings" for the same switch.
 */
export function costOf(price: PriceRow, inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * price.input_usd_per_mtok +
    (outputTokens / 1_000_000) * price.output_usd_per_mtok
  );
}

/** Cost of running one workload's observed token mix at a given price point. */
export function costOfUsage(price: PriceRow, u: UsageAggregate): number {
  return costOf(price, u.input_tokens, u.output_tokens);
}

export function toMonthly(value: number, days: number): number {
  if (days <= 0) return 0;
  return (value / days) * DAYS_IN_MONTH;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Prices grouped by model, each group deterministically ordered. */
export function indexPrices(prices: PriceRow[]): Map<string, PriceRow[]> {
  const byModel = new Map<string, PriceRow[]>();
  for (const p of prices) {
    const list = byModel.get(p.model_key) ?? [];
    list.push(p);
    byModel.set(p.model_key, list);
  }
  for (const list of byModel.values()) list.sort((a, b) => a.host.localeCompare(b.host));
  return byModel;
}

/**
 * Deterministic tie-break (Neutrality Charter clauses 01-03).
 * Cheapest wins; an exact price tie is broken alphabetically by model then host,
 * never by array position, insertion order, or vendor.
 */
export function cheaperWins(
  a: { price: PriceRow; cost: number },
  b: { price: PriceRow; cost: number },
): number {
  if (a.cost !== b.cost) return a.cost - b.cost;
  const byModel = a.price.model_key.localeCompare(b.price.model_key);
  if (byModel !== 0) return byModel;
  return a.price.host.localeCompare(b.price.host);
}

/**
 * THE savings-percentage function.
 *
 * Dispatch 92: this existed three times — once in each level — as the same
 * expression written out longhand against three differently-named baselines.
 * They agreed, but nothing made them agree, which is precisely the shape of
 * bug that put two different separation formulas in this system. One
 * definition now, and the divide-by-zero guard exists once rather than
 * nowhere: a workload whose current cost is zero has no percentage to state.
 */
export function savingPctOf(baselineCost: number, targetCost: number): number {
  if (!(baselineCost > 0)) return 0;
  return round2(((baselineCost - targetCost) / baselineCost) * 100);
}

/**
 * Display rounding for a savings percentage. One decimal, and never a bare
 * "100%": a switch that removes 99.97% of a workload's cost is still not free,
 * and rounding it to a flat 100 reads as a bug even when the arithmetic is right.
 */
export function displaySavingPct(pct: number): number {
  const oneDecimal = Math.round(pct * 10) / 10;
  return Math.min(99.9, Math.max(0, oneDecimal));
}
