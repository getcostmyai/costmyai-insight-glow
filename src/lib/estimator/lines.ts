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
 * The largest share one workload may hold: everything except the floor every
 * *other* named workload needs to stay labelled. `id` is the workload being
 * sized — omit it when sizing one that is not placed yet.
 */
export function maxShareFor(lines: DraftLine[], id?: string): number {
  const others = lines.filter((l) => l.id !== id).length;
  return 100 - others * MIN_LINE_PCT;
}

/**
 * Move one workload's share to `next`.
 *
 * Growth is carved out of the unallocated remainder first. Only once the
 * remainder is exhausted does it encroach on other named workloads, largest
 * first, and never below their floor — so a slider can genuinely reach a full
 * allocation instead of stopping dead at whatever happened to be left over.
 * Shrinking always hands the freed share straight back to the remainder.
 */
export function setShare(lines: DraftLine[], id: string, next: number): DraftLine[] {
  const target = lines.find((l) => l.id === id);
  if (!target) return lines;

  const want = Math.max(MIN_LINE_PCT, Math.min(maxShareFor(lines, id), Math.round(next)));
  const sizes = new Map(lines.map((l) => [l.id, l.sharePct]));
  sizes.set(id, want);

  // Anything the remainder could not cover is taken from the other workloads.
  let deficit = want - target.sharePct - unallocatedPct(lines);
  while (deficit > 0) {
    const donor = lines
      .filter((l) => l.id !== id && (sizes.get(l.id) ?? 0) > MIN_LINE_PCT)
      .sort((a, b) => (sizes.get(b.id) ?? 0) - (sizes.get(a.id) ?? 0))[0];
    if (!donor) break;
    const give = Math.min(deficit, (sizes.get(donor.id) ?? 0) - MIN_LINE_PCT);
    sizes.set(donor.id, (sizes.get(donor.id) ?? 0) - give);
    deficit -= give;
  }

  return lines.map((l) => ({ ...l, sharePct: sizes.get(l.id) ?? l.sharePct }));
}

/**
 * Place a new workload at the share the visitor chose in the picker, applying
 * the same carve-from-the-remainder-first rule as any later adjustment.
 */
export function addLineAt(lines: DraftLine[], line: DraftLine, sharePct: number): DraftLine[] {
  const seeded = [...lines, { ...line, sharePct: Math.min(sharePct, unallocatedPct(lines)) }];
  return setShare(seeded, line.id, sharePct);
}


/** Removing a line returns its exact share to the remainder, untouched elsewhere. */
export function removeLine(lines: DraftLine[], id: string): DraftLine[] {
  return lines.filter((l) => l.id !== id);
}
