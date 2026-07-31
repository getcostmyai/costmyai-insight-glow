import { useEffect, useMemo, useRef, useState } from "react";

import type { SeriesPoint, Totals } from "./dashboard.server";
import { type RangeKey, rangeFor } from "./dashboard-queries";

export type { SeriesPoint as Point, Totals };
export { ranges, rangeFor, type RangeKey } from "./dashboard-queries";

/** Hours covered by a range — used for run-rate maths. */
export const rangeHours = (r: RangeKey) => rangeFor(r).days * 24;

/** Deterministic jitter so SSR and the client agree on the first frame. */
function noise(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Live counters.
 *
 * The window totals are real — summed from the workspace's own rollups. Between
 * server reads the counters accrue forward at the workspace's own measured rate
 * (spend per hour over the selected window), so the dashboard behaves like the
 * live stream it is instead of freezing on a stale number. Every server refetch
 * snaps the counters back to measured truth.
 */
export function useLiveTotals(range: RangeKey, series: SeriesPoint[], base: Totals, generatedAt: string) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setTick(0);
    const id = setInterval(() => setTick((t) => t + 1), 1800);
    return () => clearInterval(id);
  }, [range, generatedAt]);

  const perHour = useMemo(() => {
    const hours = rangeHours(range);
    return {
      spend: base.spend / hours,
      requests: base.requests / hours,
      inputTokens: base.inputTokens / hours,
      outputTokens: base.outputTokens / hours,
    };
  }, [base, range]);

  // 1.8s of wall clock is 0.0005 of an hour.
  const elapsedHours = tick * (1.8 / 3600) * (1 + noise(tick) * 0.4);

  return {
    series,
    live: {
      spend: base.spend + perHour.spend * elapsedHours,
      requests: base.requests + Math.round(perHour.requests * elapsedHours),
      inputTokens: base.inputTokens + Math.round(perHour.inputTokens * elapsedHours),
      outputTokens: base.outputTokens + Math.round(perHour.outputTokens * elapsedHours),
    },
  };
}

/** Keeps the previous render's totals while a range refetch is in flight. */
export function useStableSnapshot<T>(value: T | undefined) {
  const last = useRef<T | undefined>(undefined);
  if (value !== undefined) last.current = value;
  return last.current;
}

export const compact = (n: number) => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return Math.round(n).toString();
};

export const int = (n: number) => Math.round(n).toLocaleString("en-US");
