import {
  resolveLadder,
  separationOfScores,
  type AaField,
  type LadderResolution,
} from "@/lib/benchmarks/task-ladder";

import { arbitrageBaseline, MIN_MONTHLY_SAVING_USD, sortRecommendations } from "./arbitrage";
import { cheaperWins, costOfUsage, indexPrices, round2, toMonthly } from "./cost";
import { expectedLatency, latencyNote, type LatencyEstimate } from "./latency";
import {
  DEFAULT_OBJECTIVE,
  KIND_MIN_PLAN,
  type BenchmarkRow,
  type MarginRow,
  type Objective,
  type PriceRow,
  type Recommendation,
  type Refusal,
  type UsageAggregate,
} from "./types";

/**
 * Fallback margin, used only when the sync has not yet published a measured
 * margin for a suite/task_class. Deliberately wide: an unmeasured boundary
 * should refuse switches, not wave them through.
 */
export const UNMEASURED_MARGIN = 0.5;


/**
 * Legacy discrimination guard, kept for the published Intelligence saturation
 * ratio. The engine itself now walks the ranked ladder and compares each
 * instrument's separation against SEPARATION_THRESHOLD.
 */
export const SEPARATION_FACTOR = 2;

export interface ScoreLookup {
  score(modelKey: string, instrument: string): { score: number; suite: string } | null;
  margin(suite: string, instrument: string): number;
  spread(instrument: string): number;
  separation(field: AaField): number | null;
  /** Walk the ranked ladder for a product task and say which instrument certifies it. */
  instrument(taskHint: string): LadderResolution;
}

/** Indexes benchmark scores and their measured margins for fast, suite-aware lookup. */
export function buildScoreLookup(
  benchmarks: BenchmarkRow[],
  margins: MarginRow[],
): ScoreLookup {
  const byModelTask = new Map<string, BenchmarkRow>();
  const byTask = new Map<string, number[]>();
  for (const b of benchmarks) {
    byModelTask.set(`${b.model_key}::${b.task_class}`, b);
    const list = byTask.get(b.task_class) ?? [];
    list.push(b.score);
    byTask.set(b.task_class, list);
  }

  const marginBySuiteTask = new Map<string, number>();
  for (const m of margins) marginBySuiteTask.set(`${m.suite}::${m.task_class}`, m.margin);

  const spread = (instrument: string) => {
    const list = byTask.get(instrument) ?? [];
    if (list.length < 2) return 0;
    return Math.max(...list) - Math.min(...list);
  };

  const separation = (field: AaField) => separationOfScores(byTask.get(field) ?? []);

  return {
    score(modelKey, instrument) {
      const exact = byModelTask.get(`${modelKey}::${instrument}`);
      return exact ? { score: exact.score, suite: exact.suite } : null;
    },
    margin(suite, instrument) {
      return marginBySuiteTask.get(`${suite}::${instrument}`) ?? UNMEASURED_MARGIN;
    },
    spread,
    separation,
    instrument(taskHint) {
      return resolveLadder(taskHint, separation);
    },
  };
}


export interface EquivalenceResult {
  recommendations: Recommendation[];
  refusals: Refusal[];
}

/**
 * Level 2 — Certify.
 *
 * Picks the CHEAPEST model that clears the quality bar, not the highest-scoring
 * one among the cheaper options (audit finding C1). The bar is the current
 * model's score minus the MEASURED margin for that suite/task_class (C2) — never
 * a hardcoded tolerance. Everything is priced against the Compare baseline so
 * savings never double-count.
 */
export function findQualityMatches(
  usage: UsageAggregate[],
  prices: PriceRow[],
  benchmarks: BenchmarkRow[],
  margins: MarginRow[],
  objectiveFor: (u: UsageAggregate) => Objective = () => DEFAULT_OBJECTIVE,
): EquivalenceResult {
  const byModel = indexPrices(prices);
  const lookup = buildScoreLookup(benchmarks, margins);
  const out: Recommendation[] = [];
  const refusals: Refusal[] = [];

  const refuse = (u: UsageAggregate, reason: Refusal["reason"], detail: string) =>
    refusals.push({
      fromModel: u.model_key,
      fromHost: u.host,
      taskHint: u.task_hint,
      reason,
      detail,
    });

  for (const u of usage) {
    const current = (byModel.get(u.model_key) ?? []).find((p) => p.host === u.host);
    const baseline = arbitrageBaseline(u, byModel);
    if (!current || !baseline) {
      refuse(u, "no_baseline_price", `No price on record for ${u.model_key} @ ${u.host}.`);
      continue;
    }

    /*
     * Ladder walk first: which instrument, if any, is allowed to judge this
     * workload. Ranked by semantic fit; the first rung that separates models by
     * at least SEPARATION_THRESHOLD wins. No rung passing means REFUSE — never
     * a composite index, never a borrowed instrument.
     */
    const resolution = lookup.instrument(u.task_hint);
    if (!resolution.field) {
      refuse(u, resolution.refusal ?? "no_valid_instrument", resolution.detail);
      continue;
    }
    const instrument = resolution.field;

    const currentScore = lookup.score(u.model_key, instrument);
    if (!currentScore) {
      refuse(
        u,
        "no_baseline_score",
        `No ${currentInstrumentLabel(resolution)} score for ${u.model_key}.`,
      );
      continue;
    }

    const margin = lookup.margin(currentScore.suite, instrument);


    const objective = objectiveFor(u);
    // quality_floor raises the bar; it never lowers it below the measured band.
    const bar =
      objective.objective === "quality_floor" && objective.qualityFloorScore != null
        ? Math.max(currentScore.score - margin, objective.qualityFloorScore)
        : currentScore.score - margin;

    type Candidate = { price: PriceRow; cost: number; score: number };
    const clearing: Candidate[] = [];
    let anyClearedBar = false;
    /** Cheaper + quality-equal, but dropped on latency. Split by *why*. */
    let droppedUnmeasured = 0;
    let droppedTooSlow = 0;
    let slowestSeenMs = 0;
    let winningLatency: LatencyEstimate | null = null;

    for (const [modelKey, candidatePrices] of byModel) {
      if (modelKey === u.model_key) continue;
      const s = lookup.score(modelKey, u.task_hint);
      if (!s) continue;
      if (s.score < bar) continue;
      anyClearedBar = true;
      for (const price of candidatePrices) {
        const cost = costOfUsage(price, u);
        if (cost >= baseline.cost) continue; // must actually be cheaper
        if (objective.objective === "latency" && objective.maxLatencyMs != null) {
          // Unmeasured latency is not "fast enough" — we refuse rather than assume.
          const est = expectedLatency(price, u);
          if (est == null) {
            droppedUnmeasured++;
            continue;
          }
          if (est.ms > objective.maxLatencyMs) {
            droppedTooSlow++;
            slowestSeenMs = Math.max(slowestSeenMs, est.ms);
            continue;
          }
        }
        clearing.push({ price, cost, score: s.score });
      }
    }

    if (!anyClearedBar) {
      refuse(
        u,
        "no_candidate_clears_bar",
        `Nothing benchmarks at or above ${bar.toFixed(2)} on ${u.task_hint}.`,
      );
      continue;
    }
    if (clearing.length === 0) {
      const latencyDropped = droppedUnmeasured + droppedTooSlow;
      if (objective.objective === "latency" && latencyDropped > 0) {
        refuse(
          u,
          "latency_ceiling_unmet",
          droppedTooSlow === 0
            ? `${droppedUnmeasured} cheaper quality-equal host${droppedUnmeasured === 1 ? " has" : "s have"} no measured latency yet, so none can be proven under the ${objective.maxLatencyMs}ms ceiling.`
            : `${droppedTooSlow} cheaper quality-equal host${droppedTooSlow === 1 ? "" : "s"} come in above the ${objective.maxLatencyMs}ms ceiling for this workload's output length (slowest ${slowestSeenMs}ms)${droppedUnmeasured > 0 ? `, and ${droppedUnmeasured} have no measured latency yet` : ""}.`,
        );
      } else {
        refuse(
          u,
          "no_cheaper_candidate",
          `Quality-equal options exist but none price below the current best host.`,
        );
      }
      continue;
    }


    const winner = pickByObjective(clearing, objective);
    if (objective.objective === "latency") winningLatency = expectedLatency(winner.price, u);
    const rawSaving = baseline.cost - winner.cost;
    const saving = toMonthly(rawSaving, u.days);
    if (saving < MIN_MONTHLY_SAVING_USD) {
      refuse(u, "saving_below_floor", `Best equal-quality option saves under $1/month.`);
      continue;
    }

    out.push({
      kind: "quality_match",
      minPlan: KIND_MIN_PLAN.quality_match,
      fromModel: u.model_key,
      fromHost: u.host,
      fromHostLabel: current.host_label,
      toModel: winner.price.model_key,
      toHost: winner.price.host,
      toHostLabel: winner.price.host_label,
      taskHint: u.task_hint,
      savingUsd: round2(rawSaving),
      windowDays: u.days,
      monthlySavingUsd: round2(saving),
      savingPct: round2(((baseline.cost - winner.cost) / baseline.cost) * 100),
      basis: "Quality-matched cheaper model",
      note: `${winner.score.toFixed(2)} vs ${currentScore.score.toFixed(2)} on ${currentScore.suite}/${u.task_hint}; bar ${bar.toFixed(2)} (margin ±${margin.toFixed(2)}).${winningLatency ? ` ${latencyNote(winningLatency)}.` : ""}`,
      qualityDelta: round2(winner.score - currentScore.score),
      marginUsed: margin,
      objective: objective.objective,
    });
  }

  return { recommendations: sortRecommendations(out), refusals };
}

/**
 * Clause 07 — the objective decides which of the quality-clearing candidates wins.
 * All three tie-break deterministically through cheaperWins().
 */
export function pickByObjective<T extends { price: PriceRow; cost: number; score: number }>(
  candidates: T[],
  objective: Objective,
): T {
  const sorted = [...candidates];
  if (objective.objective === "latency") {
    sorted.sort((a, b) => {
      const la = a.price.median_latency_ms ?? Number.POSITIVE_INFINITY;
      const lb = b.price.median_latency_ms ?? Number.POSITIVE_INFINITY;
      if (la !== lb) return la - lb;
      return cheaperWins(a, b);
    });
    return sorted[0];
  }
  // cost and quality_floor both take the cheapest option clearing their bar;
  // quality_floor differs by having raised that bar before we got here.
  sorted.sort(cheaperWins);
  return sorted[0];
}
