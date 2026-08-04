import { forecastMonthEnd } from "../src/lib/dashboard/forecast";
import { generateEvents, rollupEvents } from "../src/lib/synthetic/generator";

// ---- 1. Fresh real signup: 30-day backfill, low-volume business workspace ----
const now = new Date("2026-08-04T12:00:00Z");
const from = new Date(Date.UTC(2026,6,5));
const w:any = { modelKey:"gpt-4o-mini", host:"openai", taskHint:"chat", requestsPerDay:60,
  inputP50:1200, inputSpread:0.5, outputP50:300, outputP95:900, latencyP50Ms:800, errorRate:0.01 };
const ev = generateEvents({ workload:w, from, to:now });
const price = () => ({ input_usd_per_mtok: 0.15, output_usd_per_mtok: 0.6 } as any);
const days = rollupEvents(ev, "day", price);
const hours = rollupEvents(ev, "hour", price);
const cov: Record<string, number> = {};
const set = new Map<string, Set<string>>();
for (const h of hours) { const iso=h.bucketStart.toISOString(); const d=iso.slice(0,10);
  if(!set.has(d)) set.set(d,new Set()); set.get(d)!.add(iso.slice(11,13)); }
for (const [d,s] of set) cov[d]=s.size;
const rows = days.map(d=>({ date: d.bucketStart.toISOString().slice(0,10), key:"k", spend: d.costUsd }));
const reliable = [...set.keys()].sort()[1];
const f = forecastMonthEnd(rows, now, { hourCoverage: cov, coverageReliableFrom: reliable });
console.log("SIGNUP hourCoverage sample:", Object.entries(cov).slice(0,5));
console.log("SIGNUP days<20h:", Object.values(cov).filter(h=>h<20).length, "of", Object.keys(cov).length);
console.log("SIGNUP suppressed:", f.suppressed, "point:", f.pointUsd, "observedLevelDays:", f.observedLevelDays,
  "partial:", f.partialLevelDates, "reasons:", f.reasons);
