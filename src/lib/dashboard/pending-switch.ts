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
export interface PendingSwitchIndex {
  /** An active switch exists for exactly this from→to pair, with $0 accrued. */
  pair: (fromModel: string, fromHost: string, toModel: string, toHost: string) => boolean;
  /** An active switch exists off this from-pair, whatever it routes to. */
  from: (fromModel: string, fromHost: string) => boolean;
}

const norm = (s: string) => s.trim().toLowerCase();
const pairKey = (fm: string, fh: string, tm: string, th: string) =>
  `${norm(fm)}|${norm(fh)}>${norm(tm)}|${norm(th)}`;
const fromKey = (fm: string, fh: string) => `${norm(fm)}|${norm(fh)}`;

export function pendingSwitchIndex(rows: ActiveSwitchRow[]): PendingSwitchIndex {
  const pairs = new Set<string>();
  const froms = new Set<string>();
  for (const r of rows) {
    if (r.saved > 0) continue;
    pairs.add(pairKey(r.fromModel, r.fromHost, r.toModel, r.toHost));
    froms.add(fromKey(r.fromModel, r.fromHost));
  }
  return {
    pair: (fm, fh, tm, th) => pairs.has(pairKey(fm, fh, tm, th)),
    from: (fm, fh) => froms.has(fromKey(fm, fh)),
  };
}

/** One wording, used by every surface that can show the state. */
export const PENDING_SWITCH_LABEL = "Switch active — traffic not yet moved";
