/**
 * Dispatch 161 — the one rule that decides whether a switch may hold money.
 *
 * A switch that is not rerouting has captured nothing. That is true of the
 * accrual path (a container's `rerouted: true` is a claim, re-checked against
 * the switch's own gate before a cent is credited), of the render path (a card
 * that says "Allow routing to X" may not also show a captured figure), and of
 * the standing audit that fails the build when a stored row disagrees.
 *
 * Pure, so all three read the same rule rather than three copies of it.
 */
import type { SwitchExecutionState } from "@/lib/dashboard/execution-copy";

/** What may be stored or displayed, given what the switch is actually doing. */
export function creditableUsd(input: {
  state: SwitchExecutionState | undefined;
  observedUsd: number;
}): number {
  return input.state === "automatic" ? input.observedUsd : 0;
}

export interface SavedUsdRow {
  id: string;
  savedUsd: number;
  state: SwitchExecutionState | undefined;
}

/**
 * Every row that holds money it is not entitled to. Empty is the only passing
 * result; the caller decides whether that is a failed audit or a failed test.
 */
export function savedUsdViolations<T extends SavedUsdRow>(rows: T[]): T[] {
  return rows.filter((r) => Math.abs(r.savedUsd) > 0.004 && r.state !== "automatic");
}
