export type SwitchKind = "host" | "quality";

/** Shape the switch cards render. Populated live by the pipeline, never hardcoded. */
export interface SwitchRow {
  fromModel: string;
  fromHost: string;
  toModel: string;
  toHost: string;
  kind: SwitchKind;
  monthlySaving: number;
  savingPct: number;
  basis?: string;
  note?: string;
  qualityDelta?: number | null;
}

export const usd = (n: number, digits = 2) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

export const pct = (n: number, digits = 0) => `${n.toFixed(digits)}%`;
