import type { PlanTier } from "../engine/types";

/**
 * Dispatch 213 — one card per workload.
 *
 * Three independent mechanisms (arbitrage, benchmark, right-size) can each
 * find money on the *same* workload, with different destinations and different
 * dollar figures. Rendering them as three separate cards in three separate
 * lists made one opportunity look like three, which is what forced the
 * per-mechanism "these lists overlap by $X" reconciliation copy to exist.
 *
 * This module removes the cause rather than explaining it: every option found
 * on a workload is collapsed into a single group. The highest-dollar option is
 * the group's `best` — the same ordering the pages already sorted by — and the
 * rest stay visible underneath as `alternatives` rather than being hidden.
 *
 * Two invariants:
 *
 *  1. Nothing here ranks, filters, certifies or gates. It receives rows that
 *     `gateLevel` has already ranked and gated, and only regroups them. A
 *     locked option never arrives as a full row: it arrives as a count and a
 *     required plan, so no model name and no dollar figure can leak past the
 *     paywall through a teaser.
 *  2. The grouping key is the workload — from-model, from-host, task — which is
 *     the same identity Dispatch 212's supersession disclosure is scoped to.
 *     A merged card therefore keeps stating the workload's real switch state.
 */

export type MechanismKind = "host_arbitrage" | "quality_match" | "rightsize";

export interface WorkloadOption {
  kind: MechanismKind;
  toModel: string;
  toHost: string;
  toHostLabel: string;
  /** Real dollars over the selected window. Never a projection. */
  saving: number;
  savingPct: number;
}

/** A locked option, reduced to what a paywalled row may say: how many, and behind what. */
export interface LockedTeaser {
  requiredPlan: PlanTier;
  count: number;
}

export interface WorkloadRef {
  fromModel: string;
  fromHost: string;
  taskHint: string;
}

export interface WorkloadGroup {
  key: string;
  workload: WorkloadRef;
  best: WorkloadOption;
  /** Other real options on this workload, saving-descending. Collapsed, not hidden. */
  alternatives: WorkloadOption[];
  /** Count-only teasers, one entry per plan that holds something back. */
  locked: LockedTeaser[];
}

const norm = (s: string) => s.trim().toLowerCase();

export function workloadKey(w: WorkloadRef): string {
  return `${norm(w.fromModel)}|${norm(w.fromHost)}|${norm(w.taskHint)}`;
}

export function optionKey(o: WorkloadOption): string {
  return `${o.kind}|${norm(o.toModel)}|${norm(o.toHost)}`;
}

export interface GroupInput {
  /** Options the current plan may see in full. */
  unlocked: Array<{ workload: WorkloadRef; option: WorkloadOption }>;
  /**
   * Options the current plan may not see. Only the workload and the plan that
   * would unlock them cross this boundary — deliberately no money, no model.
   */
  locked: Array<{ workload: WorkloadRef; requiredPlan: PlanTier }>;
}

export function groupByWorkload(input: GroupInput): WorkloadGroup[] {
  const byWorkload = new Map<
    string,
    { workload: WorkloadRef; options: Map<string, WorkloadOption>; locked: Map<PlanTier, number> }
  >();

  const slot = (workload: WorkloadRef) => {
    const key = workloadKey(workload);
    let s = byWorkload.get(key);
    if (!s) byWorkload.set(key, (s = { workload, options: new Map(), locked: new Map() }));
    return s;
  };

  for (const { workload, option } of input.unlocked) {
    const s = slot(workload);
    const k = optionKey(option);
    const existing = s.options.get(k);
    // The same destination proposed twice is one option, worth the larger of
    // the two figures — never the sum, which would invent money.
    if (!existing || option.saving > existing.saving) s.options.set(k, option);
  }

  for (const { workload, requiredPlan } of input.locked) {
    const s = slot(workload);
    s.locked.set(requiredPlan, (s.locked.get(requiredPlan) ?? 0) + 1);
  }

  const groups: WorkloadGroup[] = [];
  for (const [key, s] of byWorkload) {
    const options = [...s.options.values()].sort(compareOptions);
    const best = options[0];
    // A workload with nothing but locked findings has no card of its own: the
    // locked level already renders its own count-and-money summary.
    if (!best) continue;
    groups.push({
      key,
      workload: s.workload,
      best,
      alternatives: options.slice(1),
      locked: [...s.locked.entries()].map(([requiredPlan, count]) => ({ requiredPlan, count })),
    });
  }
  // Cards are laid out saving-descending, exactly as the lists were before.
  return groups.sort((a, b) => b.best.saving - a.best.saving);
}

/** Look a workload's group up from a rendered row. */
export function groupFor(
  groups: WorkloadGroup[] | undefined,
  w: WorkloadRef,
): WorkloadGroup | null {
  if (!groups) return null;
  const key = workloadKey(w);
  return groups.find((g) => g.key === key) ?? null;
}

/**
 * Does this rendered row carry the workload's best option?
 *
 * The merged card is drawn once, in the list belonging to the mechanism that
 * found the winning option. Every other list skips the workload instead of
 * drawing a second card for money that is already on screen.
 */
export function isBestRow(
  group: WorkloadGroup | null,
  row: { kind: MechanismKind; toModel: string; toHost: string },
): boolean {
  if (!group) return true;
  return (
    group.best.kind === row.kind &&
    norm(group.best.toModel) === norm(row.toModel) &&
    norm(group.best.toHost) === norm(row.toHost)
  );
}

/**
 * Dispatch 223 — Compare's arbitrage-only view of a workload group.
 *
 * Compare sells one mechanism: the same model on a cheaper host. Anything the
 * other two mechanisms found on the same workload — a benchmarked swap, a
 * right-size — is a different product, and Compare may show no trace of it:
 * no dollar figure, no model name, and not even a count behind an "Unlock"
 * link. The count teaser is correct on Certify (Dispatch 211–212) because that
 * page's reader has already bought the tier below it; on Compare it would
 * advertise findings the page itself is not entitled to describe.
 *
 * This is the single place that rule is enforced. Compare passes every group
 * through here — both for `isBestRow` and for the collapsed alternatives — so
 * the page cannot regain a non-arbitrage row through some other call site.
 */
export function arbitrageOnlyGroup(group: WorkloadGroup | null): WorkloadGroup | null {
  if (!group) return null;
  const options = [group.best, ...group.alternatives]
    .filter((o) => o.kind === "host_arbitrage")
    .sort((a, b) => b.saving - a.saving);
  const best = options[0];
  if (!best) return null;
  return {
    key: group.key,
    workload: group.workload,
    best,
    alternatives: options.slice(1),
    locked: [],
  };
}
