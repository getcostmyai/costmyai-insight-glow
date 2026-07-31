import type { PriceRow, UsageAggregate } from "./types";

/**
 * Expected end-to-end latency for one workload on one host.
 *
 * Latency is not a property of a host alone — it is time-to-first-token plus
 * however long the workload's own output takes to stream. A 40-token
 * classification and a 4,000-token generation on the same endpoint are not
 * the same wait, so the workload's measured average output length is part of
 * the calculation rather than an assumed request shape.
 *
 * Precedence:
 *  1. `median_latency_ms` — a genuine end-to-end measurement on this host.
 *  2. `median_ttft_ms` + `output_tps` — derived, with the feed's scope attached.
 *  3. null — unmeasured. The caller must refuse, never assume "fast enough".
 */
export interface LatencyEstimate {
  ms: number;
  /** "host" = measured on this endpoint. "model" = feed median across hosts. */
  scope: "host" | "model";
  derived: boolean;
}

export function avgOutputTokens(u: UsageAggregate): number {
  if (u.requests <= 0) return 0;
  return u.output_tokens / u.requests;
}

export function expectedLatency(price: PriceRow, u: UsageAggregate): LatencyEstimate | null {
  if (price.median_latency_ms != null && Number.isFinite(price.median_latency_ms)) {
    return { ms: Math.round(price.median_latency_ms), scope: "host", derived: false };
  }
  const ttft = price.median_ttft_ms;
  const tps = price.output_tps;
  if (ttft == null || tps == null || !(tps > 0)) return null;
  const ms = Math.round(ttft + (avgOutputTokens(u) / tps) * 1000);
  return {
    ms,
    scope: price.latency_scope === "host" ? "host" : "model",
    derived: true,
  };
}

/** Human-readable provenance, so no recommendation overstates what was measured. */
export function latencyNote(e: LatencyEstimate): string {
  const basis = e.derived ? "time-to-first-token + output rate" : "measured end-to-end";
  return e.scope === "host"
    ? `${e.ms}ms expected (${basis}, measured on this host)`
    : `${e.ms}ms expected (${basis}; feed publishes one median per model across hosts, not per endpoint)`;
}
