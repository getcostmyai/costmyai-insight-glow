import type { SwitchExecution } from "@/lib/dashboard/execution-copy";
export type SwitchKind = "host" | "quality";

/** Shape the switch cards render. Populated live by the pipeline, never hardcoded. */
import type { FrictionBadge } from "@/lib/switching/friction";

export interface SwitchRow {
  fromModel: string;
  fromHost: string;
  toModel: string;
  toHost: string;
  /** Raw host keys + workload, used to identify the row server-side on activate. */
  fromHostKey: string;
  toHostKey: string;
  taskHint: string;
  kind: SwitchKind;
  /** Real dollars saved inside the window on screen. Never a run-rate. */
  saving: number;
  savingPct: number;
  basis?: string;
  note?: string;
  qualityDelta?: number | null;
  /** Dispatch 157. What pressing the action would really do. Server-decided. */
  execution?: SwitchExecution;
  /** Dispatch 193. Display-only switching-friction tier. Never read by the engine. */
  friction?: FrictionBadge;
}

/**
 * Money, formatted.
 *
 * Dispatch 172. A real workspace's first day of traffic costs fractions of a
 * cent, and `$0.00` for $0.001445 is indistinguishable from a workspace that
 * spent nothing at all — the one reading a new customer most needs to trust.
 * Anything nonzero that would round away is printed as `< $0.01` instead, so
 * "we saw no traffic" and "we saw traffic too small to price at two decimals"
 * can never render the same string.
 */
export const usd = (n: number, digits = 2) => {
  const fmt = (d: number) =>
    `$${n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
  if (n !== 0 && Number.isFinite(n)) {
    const abs = Math.abs(n);
    // Rounds to zero at the requested precision, but is not zero.
    if (abs < 0.5 * 10 ** -digits) {
      if (abs < 0.005) return n < 0 ? "> -$0.01" : "< $0.01";
      // e.g. usd(0.4, 0) — show the cents rather than print "$0".
      return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
  }
  return fmt(digits);
};


export const pct = (n: number, digits = 0) => `${n.toFixed(digits)}%`;
