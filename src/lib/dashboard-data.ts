import type { SwitchExecution } from "@/lib/dashboard/execution-copy";
export type SwitchKind = "host" | "quality";

/** Shape the switch cards render. Populated live by the pipeline, never hardcoded. */
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
}

export const usd = (n: number, digits = 2) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

export const pct = (n: number, digits = 0) => `${n.toFixed(digits)}%`;
