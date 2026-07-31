import { costOf } from "@/lib/engine/cost";
import type { PriceRow } from "@/lib/engine/types";

import type { SyntheticWorkload } from "./workloads";

/**
 * Deterministic generator for the synthetic ecosystem.
 *
 * Two hard rules:
 *  1. Same seed + same window => byte-identical output. A demo that reshuffles
 *     itself on every reseed cannot be audited, and neither can the engine
 *     decisions computed on top of it.
 *  2. Rollups are always derived by aggregating generated events through this
 *     module — never written independently. If the two could drift, the
 *     dashboard and the raw metadata would tell different stories.
 */

/** Small, fast, fully deterministic PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

/**
 * Traffic curve. Product traffic is not uniform: it follows the working day of
 * the customer base and drops on weekends. Normalised so the mean weight over a
 * full week is 1, which keeps `requestsPerDay` meaning what it says.
 */
export function trafficWeight(date: Date): number {
  const hour = date.getUTCHours();
  const dow = date.getUTCDay();
  // Two peaks: EU afternoon and US morning, both in UTC.
  const diurnal =
    0.45 +
    0.85 * Math.exp(-((hour - 10) ** 2) / 18) +
    0.95 * Math.exp(-((hour - 16) ** 2) / 22) +
    0.15 * Math.exp(-((hour - 2) ** 2) / 30);
  const weekly = dow === 0 ? 0.42 : dow === 6 ? 0.48 : 1;
  return diurnal * weekly;
}

/** Mean weight across a whole week, used to normalise the curve. */
const MEAN_WEEKLY_WEIGHT = (() => {
  let sum = 0;
  for (let h = 0; h < 24 * 7; h++) sum += trafficWeight(new Date(Date.UTC(2024, 0, 7, h)));
  return sum / (24 * 7);
})();

/** Gentle organic growth so a connected ecosystem visibly trends, not jumps. */
export function growthFactor(dayIndex: number, totalDays: number): number {
  const t = totalDays <= 1 ? 1 : dayIndex / (totalDays - 1);
  return 0.88 + 0.24 * t;
}

/** Log-normal draw with the given median and p95. */
export function lognormal(rand: () => number, median: number, p95: number): number {
  const sigma = Math.max(Math.log(Math.max(p95, median * 1.01) / median) / 1.6449, 0.05);
  // Box-Muller.
  const u1 = Math.max(rand(), 1e-9);
  const u2 = rand();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(1, Math.round(median * Math.exp(sigma * z)));
}

export interface SyntheticEvent {
  occurredAt: Date;
  modelKey: string;
  host: string;
  taskHint: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  status: "ok" | "error";
}

export interface GenerateOptions {
  workload: SyntheticWorkload;
  /** Inclusive hour-aligned start. */
  from: Date;
  /** Exclusive end. */
  to: Date;
  seed?: string;
}

/**
 * Expand one workload into the individual metadata records the middleware
 * would have pushed. Hour by hour, so the traffic curve is real rather than
 * smeared across the day.
 */
export function generateEvents({ workload, from, to, seed = "costmyai" }: GenerateOptions): SyntheticEvent[] {
  const events: SyntheticEvent[] = [];
  const totalDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY_MS));
  const base = hashSeed(`${seed}|${workload.modelKey}|${workload.host}|${workload.taskHint}`);

  for (let t = from.getTime(); t < to.getTime(); t += HOUR_MS) {
    const hourStart = new Date(t);
    const dayIndex = Math.floor((t - from.getTime()) / DAY_MS);
    const rand = mulberry32(base ^ hashSeed(String(t)));

    const expected =
      (workload.requestsPerDay / 24) *
      (trafficWeight(hourStart) / MEAN_WEEKLY_WEIGHT) *
      growthFactor(dayIndex, totalDays);

    // Fractional expectation resolved probabilistically so low-volume
    // workloads still produce whole requests at a believable cadence.
    const whole = Math.floor(expected);
    const count = whole + (rand() < expected - whole ? 1 : 0);

    for (let i = 0; i < count; i++) {
      const status = rand() < workload.errorRate ? "error" : "ok";
      const inputTokens = lognormal(rand, workload.inputP50, workload.inputP50 * workload.inputSpread);
      // A failed upstream call still consumed the prompt but returned nothing.
      const outputTokens = status === "error" ? 0 : lognormal(rand, workload.outputP50, workload.outputP95);
      const latencyMs =
        status === "error"
          ? Math.round(workload.latencyP50Ms * (0.2 + 0.3 * rand()))
          : Math.round(workload.latencyP50Ms * (0.72 + 0.85 * rand() ** 2));

      events.push({
        occurredAt: new Date(t + Math.floor(rand() * HOUR_MS)),
        modelKey: workload.modelKey,
        host: workload.host,
        taskHint: workload.taskHint,
        inputTokens,
        outputTokens,
        latencyMs,
        status,
      });
    }
  }

  events.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  return events;
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export type Granularity = "hour" | "day";

export function bucketStart(date: Date, granularity: Granularity): Date {
  const d = new Date(date.getTime());
  d.setUTCMinutes(0, 0, 0);
  if (granularity === "day") d.setUTCHours(0, 0, 0, 0);
  return d;
}

export interface RollupRow {
  bucketStart: Date;
  granularity: Granularity;
  modelKey: string;
  host: string;
  taskHint: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  outputP50: number;
  outputP95: number;
}

/**
 * Aggregate events into rollups. Cost is priced through the engine's single
 * cost function, so a rollup can never claim a different price than a
 * recommendation computed from the same tokens.
 */
export function rollupEvents(
  events: SyntheticEvent[],
  granularity: Granularity,
  priceFor: (modelKey: string, host: string) => PriceRow | undefined,
): RollupRow[] {
  const buckets = new Map<string, { row: RollupRow; outputs: number[] }>();

  for (const e of events) {
    const start = bucketStart(e.occurredAt, granularity);
    const key = `${start.toISOString()}|${e.modelKey}|${e.host}|${e.taskHint}`;
    let entry = buckets.get(key);
    if (!entry) {
      entry = {
        row: {
          bucketStart: start,
          granularity,
          modelKey: e.modelKey,
          host: e.host,
          taskHint: e.taskHint,
          requests: 0,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          outputP50: 0,
          outputP95: 0,
        },
        outputs: [],
      };
      buckets.set(key, entry);
    }
    entry.row.requests += 1;
    entry.row.inputTokens += e.inputTokens;
    entry.row.outputTokens += e.outputTokens;
    if (e.status === "ok") entry.outputs.push(e.outputTokens);
  }

  const rows: RollupRow[] = [];
  for (const { row, outputs } of buckets.values()) {
    const price = priceFor(row.modelKey, row.host);
    row.costUsd = price ? costOf(price, row.inputTokens, row.outputTokens) : 0;
    outputs.sort((a, b) => a - b);
    row.outputP50 = percentile(outputs, 50);
    row.outputP95 = percentile(outputs, 95);
    rows.push(row);
  }

  rows.sort(
    (a, b) =>
      a.bucketStart.getTime() - b.bucketStart.getTime() ||
      a.modelKey.localeCompare(b.modelKey) ||
      a.host.localeCompare(b.host),
  );
  return rows;
}
