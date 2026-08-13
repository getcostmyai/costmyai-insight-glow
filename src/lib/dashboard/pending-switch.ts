import type { ActiveSwitchRow } from "@/lib/dashboard.server";

/**
 * A switch can be running while its traffic has not moved yet.
 *
 * The engine reads rollups: until the workload's requests actually leave the
 * old pair, the spend is still there and the row is still, truthfully, an
 * opportunity. Hiding it would understate what is on the table; offering a
 * plain "Switch" would imply nothing has been done. So the row stays and is
 * tagged with its real state instead.
 *
 * "Not yet moved" is deliberately defined as accrued saving of zero, not as
 * "activated recently": a switch that books a cent has moved traffic, whatever
 * its age, and one that books nothing after a week has not.
 */
/** Where an already-running switch for a workload actually routes. */
export interface ActiveSwitchTarget {
  toModel: string;
  toHost: string;
}

export interface PendingSwitchIndex {
  /** An active switch exists for exactly this from→to pair, with $0 accrued. */
  pair: (fromModel: string, fromHost: string, toModel: string, toHost: string) => boolean;
  /**
   * An active switch exists from this pair to this model, whatever host it
   * lands on. Right-sizing names a target model, not a target host, so the
   * host is not part of that identity.
   */
  fromTo: (fromModel: string, fromHost: string, toModel: string) => boolean;
  /** An active switch exists off this from-pair, whatever it routes to. */
  from: (fromModel: string, fromHost: string) => boolean;
  /**
   * Dispatch 212. The workload's running switch, whatever it targets.
   *
   * Disclosure is scoped to the workload, not to the destination: the same
   * workload appears in several lists with different targets, and a row that
   * says nothing because *its* target differs presents a superseded candidate
   * as live. Every list asks this question and states the answer.
   */
  activeFrom: (fromModel: string, fromHost: string) => ActiveSwitchTarget | null;
}

const norm = (s: string) => s.trim().toLowerCase();
const pairKey = (fm: string, fh: string, tm: string, th: string) =>
  `${norm(fm)}|${norm(fh)}>${norm(tm)}|${norm(th)}`;
const fromKey = (fm: string, fh: string) => `${norm(fm)}|${norm(fh)}`;
const fromToKey = (fm: string, fh: string, tm: string) => `${norm(fm)}|${norm(fh)}>${norm(tm)}`;

export function pendingSwitchIndex(rows: ActiveSwitchRow[]): PendingSwitchIndex {
  const pairs = new Set<string>();
  const froms = new Map<string, ActiveSwitchTarget>();
  const fromTos = new Set<string>();
  for (const r of rows) {
    if (r.saved > 0) continue;
    pairs.add(pairKey(r.fromModel, r.fromHost, r.toModel, r.toHost));
    if (!froms.has(fromKey(r.fromModel, r.fromHost))) {
      froms.set(fromKey(r.fromModel, r.fromHost), { toModel: r.toModel, toHost: r.toHost });
    }
    fromTos.add(fromToKey(r.fromModel, r.fromHost, r.toModel));
  }
  return {
    pair: (fm, fh, tm, th) => pairs.has(pairKey(fm, fh, tm, th)),
    fromTo: (fm, fh, tm) => fromTos.has(fromToKey(fm, fh, tm)),
    from: (fm, fh) => froms.has(fromKey(fm, fh)),
    activeFrom: (fm, fh) => froms.get(fromKey(fm, fh)) ?? null,
  };
}

/** True when the running switch is the one this row is proposing. */
export const isSameTarget = (
  active: ActiveSwitchTarget | null | undefined,
  toModel: string,
  toHost: string,
) => !!active && norm(active.toModel) === norm(toModel) && norm(active.toHost) === norm(toHost);

/**
 * Wording for a workload whose running switch goes somewhere else than this
 * row proposes. It is not "armed" — nothing arms this candidate — so it must
 * not borrow the armed sentence.
 */
export const supersededLabel = (active: ActiveSwitchTarget) =>
  `Already switched to ${active.toModel} — traffic not yet moved`;


/** One wording, used by every surface that can show the state. */
export const PENDING_SWITCH_LABEL = "Switch active — traffic not yet moved";
