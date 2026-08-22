/**
 * Client-safe allocation model for the multi-line estimator.
 *
 * The bar is a list of named lines plus one unallocated remainder that is never
 * priced. Every operation here keeps the invariant by construction: whole
 * percentages, no line below MIN_LINE_PCT, and the sum of lines plus the
 * remainder is always exactly 100. Nothing a visitor can do with the bar can
 * produce an invalid allocation, so the UI never has to validate one.
 */

import type { WorkloadId } from "./spec";

export interface DraftLine {
  id: string;
  workload: WorkloadId;
  provider: string | null;
  modelKey: string | null;
  /** Whole percent of the total monthly spend. */
  sharePct: number;
}

/**
 * Six. Past that the bar segments are too narrow to label honestly, and a
 * seventh rough guess adds no signal a visitor could stand behind.
 */
export const MAX_LINES = 6;

/** A segment thinner than this cannot carry a readable label. */
export const MIN_LINE_PCT = 2;

/**
 * A new line takes 30% of the spend, or whatever is left if less. It is carved
 * out of the unallocated remainder ONLY — already-placed lines are never
 * silently redistributed.
 */
export const DEFAULT_LINE_PCT = 30;

export function unallocatedPct(lines: DraftLine[]): number {
  return 100 - lines.reduce((sum, l) => sum + l.sharePct, 0);
}

export function startingShare(lines: DraftLine[]): number {
  return Math.min(DEFAULT_LINE_PCT, unallocatedPct(lines));
}

export function canAddLine(lines: DraftLine[]): { ok: boolean; reason: string | null } {
  if (lines.length >= MAX_LINES) {
    return { ok: false, reason: `Six workloads is the limit — past that the shares stop meaning anything.` };
  }
  if (unallocatedPct(lines) < MIN_LINE_PCT) {
    return { ok: false, reason: `Nothing left to allocate — shrink a line first.` };
  }
  return { ok: true, reason: null };
}

/**
 * Resize the boundary between segment `index` and segment `index + 1`, where
 * the segment list is [...lines, unallocated]. `nextLeftPct` is the requested
 * new size of the left segment; the pair's combined width is conserved, so no
 * other segment moves.
 */
export function resizeBoundary(
  lines: DraftLine[],
  index: number,
  nextLeftPct: number,
): DraftLine[] {
  const remainder = unallocatedPct(lines);
  const sizes = [...lines.map((l) => l.sharePct), remainder];
  if (index < 0 || index >= sizes.length - 1) return lines;

  const pair = sizes[index] + sizes[index + 1];
  // The remainder may go to zero; a named line may not go below its floor.
  const leftMin = index < lines.length ? MIN_LINE_PCT : 0;
  const rightMin = index + 1 < lines.length ? MIN_LINE_PCT : 0;

  const left = Math.max(leftMin, Math.min(pair - rightMin, Math.round(nextLeftPct)));
  const right = pair - left;

  return lines.map((line, i) => {
    if (i === index) return { ...line, sharePct: left };
    if (i === index + 1) return { ...line, sharePct: right };
    return line;
  });
}

/** Removing a line returns its exact share to the remainder, untouched elsewhere. */
export function removeLine(lines: DraftLine[], id: string): DraftLine[] {
  return lines.filter((l) => l.id !== id);
}
