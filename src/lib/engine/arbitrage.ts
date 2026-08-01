import { cheaperWins, costOfUsage, indexPrices, round2, toMonthly } from "./cost";
import { KIND_MIN_PLAN, type PriceRow, type Recommendation, type UsageAggregate } from "./types";

/** Below this monthly figure a switch is not worth a customer's attention. */
export const MIN_MONTHLY_SAVING_USD = 1;

export interface ArbitrageBaseline {
  price: PriceRow;
  cost: number;
}

/**
 * The cheapest host for the model a workload is already on.
 * Every downstream check prices against this, so Certify and Rightsize can never
 * re-count the saving that Compare already found.
 */
export function arbitrageBaseline(
  u: UsageAggregate,
  byModel: Map<string, PriceRow[]>,
): ArbitrageBaseline | null {
  const candidates = byModel.get(u.model_key) ?? [];
  if (candidates.length === 0) return null;
  const scored = candidates.map((price) => ({ price, cost: costOfUsage(price, u) }));
  scored.sort(cheaperWins);
  return scored[0];
}

/**
 * Level 1 — Compare (free).
 * Same model, cheaper host. Zero quality risk, so it always runs first.
 */
export function findHostArbitrage(usage: UsageAggregate[], prices: PriceRow[]): Recommendation[] {
  const byModel = indexPrices(prices);
  const out: Recommendation[] = [];

  for (const u of usage) {
    const candidates = byModel.get(u.model_key) ?? [];
    const current = candidates.find((p) => p.host === u.host);
    if (!current) continue;

    const currentCost = costOfUsage(current, u);
    const best = arbitrageBaseline(u, byModel);
    if (!best || best.price.host === current.host) continue;

    const rawSaving = currentCost - best.cost;
    const saving = toMonthly(rawSaving, u.days);
    if (saving < MIN_MONTHLY_SAVING_USD) continue;

    out.push({
      kind: "host_arbitrage",
      minPlan: KIND_MIN_PLAN.host_arbitrage,
      fromModel: u.model_key,
      fromHost: u.host,
      fromHostLabel: current.host_label,
      toModel: u.model_key,
      toHost: best.price.host,
      toHostLabel: best.price.host_label,
      taskHint: u.task_hint,
      savingUsd: round2(rawSaving),
      windowDays: u.days,
      monthlySavingUsd: round2(saving),
      savingPct: round2(((currentCost - best.cost) / currentCost) * 100),
      basis: "Same model, cheaper host",
      note: "Identical weights, identical output — only the provider changes.",
      qualityDelta: 0,
      marginUsed: null,
      objective: "cost",
    });
  }

  return sortRecommendations(out);
}

/** Stable ordering for display: biggest saving first, ties broken deterministically. */
export function sortRecommendations(recs: Recommendation[]): Recommendation[] {
  return [...recs].sort((a, b) => {
    if (b.monthlySavingUsd !== a.monthlySavingUsd) return b.monthlySavingUsd - a.monthlySavingUsd;
    const m = a.fromModel.localeCompare(b.fromModel);
    if (m !== 0) return m;
    const h = a.fromHost.localeCompare(b.fromHost);
    if (h !== 0) return h;
    return (a.toModel ?? "").localeCompare(b.toModel ?? "");
  });
}
