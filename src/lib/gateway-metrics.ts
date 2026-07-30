import { useEffect, useMemo, useRef, useState } from "react";

export type RangeKey = "24h" | "7d" | "30d";

export const ranges: { key: RangeKey; label: string; long: string }[] = [
  { key: "24h", label: "24h", long: "last 24 hours" },
  { key: "7d", label: "7d", long: "last 7 days" },
  { key: "30d", label: "30d", long: "last 30 days" },
];

export interface Point {
  date: string;
  spend: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
}

/** Deterministic pseudo-random so SSR and client agree on the baseline shape. */
function noise(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** Baseline daily spend ~ $77/day → ~$2.3k / 30d, with weekend dips. */
function dayFactor(i: number) {
  const weekend = i % 7 === 5 || i % 7 === 6;
  return (weekend ? 0.55 : 1) * (0.9 + noise(i) * 0.2);
}

/** Intraday curve: quiet nights, busy working hours. */
function hourFactor(h: number) {
  const base = 0.35 + 0.65 * Math.max(0, Math.sin(((h - 4) / 24) * Math.PI * 1.9));
  return base * (0.92 + noise(h + 99) * 0.16);
}

const DAILY_SPEND = 77;
const REQ_PER_DOLLAR = 43.5;
const IN_TOK_PER_REQ = 4400;
const OUT_TOK_PER_REQ = 1550;

function point(label: string, spend: number): Point {
  const requests = Math.round(spend * REQ_PER_DOLLAR);
  return {
    date: label,
    spend: Math.round(spend * 100) / 100,
    requests,
    inputTokens: Math.round(requests * IN_TOK_PER_REQ),
    outputTokens: Math.round(requests * OUT_TOK_PER_REQ),
  };
}

export function buildSeries(range: RangeKey): Point[] {
  if (range === "24h") {
    const now = new Date();
    return Array.from({ length: 24 }, (_, i) => {
      const d = new Date(now.getTime() - (23 - i) * 3600_000);
      const h = d.getHours();
      return point(`${String(h).padStart(2, "0")}:00`, (DAILY_SPEND / 24) * hourFactor(h) * 2.05);
    });
  }
  const n = range === "7d" ? 7 : 30;
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getTime() - (n - 1 - i) * 86_400_000);
    const label = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return point(label, DAILY_SPEND * dayFactor(d.getDate() + d.getMonth() * 31));
  });
}

export interface Totals {
  spend: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
}

export function sumSeries(series: Point[]): Totals {
  return series.reduce<Totals>(
    (a, p) => ({
      spend: a.spend + p.spend,
      requests: a.requests + p.requests,
      inputTokens: a.inputTokens + p.inputTokens,
      outputTokens: a.outputTokens + p.outputTokens,
    }),
    { spend: 0, requests: 0, inputTokens: 0, outputTokens: 0 },
  );
}

/** Previous comparable window, for the trend delta. */
export function previousTotals(range: RangeKey): Totals {
  const base = sumSeries(buildSeries(range));
  const drift = range === "24h" ? 0.94 : range === "7d" ? 0.91 : 0.88;
  return {
    spend: base.spend * drift,
    requests: Math.round(base.requests * drift),
    inputTokens: Math.round(base.inputTokens * drift),
    outputTokens: Math.round(base.outputTokens * drift),
  };
}

/**
 * Live counters. Users stream their real gateway traffic into CostMyAI, so the
 * headline totals tick upward continuously instead of sitting on a static number.
 */
export function useLiveTotals(range: RangeKey) {
  const series = useMemo(() => buildSeries(range), [range]);
  const base = useMemo(() => sumSeries(series), [series]);
  const [tick, setTick] = useState(0);
  const started = useRef<number>(0);

  useEffect(() => {
    setTick(0);
    started.current = Date.now();
    const id = setInterval(() => setTick((t) => t + 1), 1800);
    return () => clearInterval(id);
  }, [range]);

  // ~$0.9/min of live spend, scaled by how busy the window is.
  const perTick = (base.spend / (range === "24h" ? 24 : range === "7d" ? 7 * 24 : 30 * 24)) / 1400;
  const grown = tick * perTick * (1 + noise(tick) * 0.6);

  const spend = base.spend + grown;
  const requests = base.requests + Math.round(grown * REQ_PER_DOLLAR);
  const inputTokens = base.inputTokens + Math.round(grown * REQ_PER_DOLLAR * IN_TOK_PER_REQ);
  const outputTokens = base.outputTokens + Math.round(grown * REQ_PER_DOLLAR * OUT_TOK_PER_REQ);

  return { series, live: { spend, requests, inputTokens, outputTokens }, base };
}

export const compact = (n: number) => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return Math.round(n).toString();
};

export const int = (n: number) => Math.round(n).toLocaleString("en-US");

/** Hours covered by a range — used for run-rate maths. */
export const rangeHours = (r: RangeKey) => (r === "24h" ? 24 : r === "7d" ? 168 : 720);
