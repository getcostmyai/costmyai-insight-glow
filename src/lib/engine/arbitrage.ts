import { cheaperWins, costOfUsage, indexPrices, round2, savingPctOf, toMonthly } from "./cost";
import {
  KIND_MIN_PLAN,
  type PriceRow,
  type Recommendation,
  type Refusal,
  type UsageAggregate,
} from "./types";

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
export interface ArbitrageResult {
  recommendations: Recommendation[];
  refusals: Refusal[];
}

export function findHostArbitrageFull(
  usage: UsageAggregate[],
  prices: PriceRow[],
): ArbitrageResult {
  const byModel = indexPrices(prices);
  const out: Recommendation[] = [];
  const refusals: Refusal[] = [];

  const refuse = (u: UsageAggregate, reason: Refusal["reason"], detail: string) =>
    refusals.push({
      kind: "host_arbitrage",
      fromModel: u.model_key,
      fromHost: u.host,
      taskHint: u.task_hint,
      reason,
      detail,
    });

  for (const u of usage) {
    const candidates = byModel.get(u.model_key) ?? [];
    const current = candidates.find((p) => p.host === u.host);
    if (!current) {
      refuse(u, "no_baseline_price", `No price on record for ${u.model_key} @ ${u.host}.`);
      continue;
    }

    const currentCost = costOfUsage(current, u);
    const best = arbitrageBaseline(u, byModel);
    if (!best || best.price.host === current.host) {
      refuse(
        u,
        "no_cheaper_candidate",
        `${u.host} is already the cheapest priced host on record for ${u.model_key}.`,
      );
      continue;
    }

    const rawSaving = currentCost - best.cost;
    const saving = toMonthly(rawSaving, u.days);
    if (saving < MIN_MONTHLY_SAVING_USD) {
      refuse(
        u,
        "saving_below_floor",
        `Cheapest host (${best.price.host}) saves only $${saving.toFixed(2)}/month, under the $${MIN_MONTHLY_SAVING_USD} floor.`,
      );
      continue;
    }

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
      savingPct: savingPctOf(currentCost, best.cost),
      basis: "Same model, cheaper host",
      note: "Identical weights, identical output — only the provider changes.",
      qualityDelta: 0,
      marginUsed: null,
      objective: "cost",
    });
  }

  return { recommendations: sortRecommendations(out), refusals };
}

/** Back-compat wrapper: recommendations only. */
export function findHostArbitrage(usage: UsageAggregate[], prices: PriceRow[]): Recommendation[] {
  return findHostArbitrageFull(usage, prices).recommendations;
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
