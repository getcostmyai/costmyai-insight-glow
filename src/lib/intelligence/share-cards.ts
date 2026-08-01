import type { IntelligencePayload } from "./intelligence.server";

/**
 * One shared vocabulary of citable cards.
 *
 * Every share control on the page and every generated share image reads from
 * this list, so the number in the image is by construction the same number the
 * card shows — there is no second formatter to drift.
 */

export type ShareTone = "brand" | "up" | "down" | "neutral";

export interface ShareCard {
  /** Stable anchor id — identical on the live page and on the frozen month page. */
  id: string;
  /** The number, already formatted for display. */
  value: string;
  /** Short caption under the number. */
  label: string;
  /** One sentence of context. */
  detail: string;
  tone: ShareTone;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

const usd = (n: number) => (n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(n < 0.01 ? 4 : 3)}`);
const signedPct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;

export const moveCardId = (kind: "increase" | "decrease", modelKey: string, host: string) =>
  `move-${kind === "increase" ? "up" : "down"}-${slugify(modelKey)}-${slugify(host)}`;
export const spreadCardId = (modelKey: string) => `spread-${slugify(modelKey)}`;
export const bandCardId = (taskClass: string) => `band-${slugify(taskClass)}`;
export const repricerCardId = (host: string) => `repricer-${slugify(host)}`;

export function shareCards(data: IntelligencePayload): ShareCard[] {
  const m = data.monthLabel;
  const cards: ShareCard[] = [
    {
      id: "kpi-models",
      value: String(data.liveModels),
      label: "Models tracked",
      detail: "Active entries in the live CostMyAI catalogue.",
      tone: "brand",
    },
    {
      id: "kpi-providers",
      value: String(data.liveHosts),
      label: "Providers tracked",
      detail: "Distinct hosts with at least one live price.",
      tone: "brand",
    },
    {
      id: "kpi-moves",
      value: String(data.changesTotal),
      label: `Price moves in ${m}`,
      detail: `${data.increases} up, ${data.decreases} down. New listings are counted separately.`,
      tone: "brand",
    },
    {
      id: "kpi-increases",
      value: String(data.increases),
      label: `Price increases in ${m}`,
      detail: "Observed provider price rises recorded in the append-only ledger.",
      tone: "up",
    },
    {
      id: "kpi-decreases",
      value: String(data.decreases),
      label: `Price decreases in ${m}`,
      detail: "Observed provider price cuts recorded in the append-only ledger.",
      tone: "down",
    },
    {
      id: "kpi-new-models",
      value: String(data.newModels),
      label: `New models in ${m}`,
      detail: "Models seen for the first time in the catalogue this month.",
      tone: "brand",
    },
    {
      id: "kpi-multi-host",
      value: String(data.multiHostModels),
      label: "Models on 2+ providers",
      detail: "Identical weights served by more than one real provider.",
      tone: "brand",
    },
  ];

  for (const r of data.topIncreases) {
    cards.push({
      id: moveCardId("increase", r.modelKey, r.host),
      value: signedPct(r.pct),
      label: `${r.modelKey} at ${r.hostLabel}`,
      detail: `Price increase recorded in ${m}. ${r.inputPrev != null ? usd(r.inputPrev) : "—"} to ${r.inputNow != null ? usd(r.inputNow) : "—"} per MTok in.`,
      tone: "up",
    });
  }
  for (const r of data.topDecreases) {
    cards.push({
      id: moveCardId("decrease", r.modelKey, r.host),
      value: signedPct(r.pct),
      label: `${r.modelKey} at ${r.hostLabel}`,
      detail: `Price decrease recorded in ${m}. ${r.inputPrev != null ? usd(r.inputPrev) : "—"} to ${r.inputNow != null ? usd(r.inputNow) : "—"} per MTok in.`,
      tone: "down",
    });
  }
  for (const r of data.repricers) {
    cards.push({
      id: repricerCardId(r.host),
      value: String(r.changes),
      label: `${r.hostLabel} price moves`,
      detail: `${r.changes} recorded moves across ${r.models} model${r.models === 1 ? "" : "s"}.`,
      tone: "brand",
    });
  }
  for (const s of data.spreads) {
    cards.push({
      id: spreadCardId(s.modelKey),
      value: `+${Math.round(s.spreadPct)}%`,
      label: `${s.displayName} provider spread`,
      detail: `Same weights: ${usd(s.cheapest)} at ${s.cheapestHost} versus ${usd(s.dearest)} at ${s.dearestHost}, across ${s.hosts} providers.`,
      tone: "up",
    });
  }
  for (const w of data.bandWinners) {
    cards.push({
      id: bandCardId(w.taskClass),
      value: usd(w.pricePerMtok),
      label: `Cheapest model clearing ${w.taskClass}`,
      detail: `${w.displayName} scores ${w.score.toFixed(2)} on ${w.suite}, above the ${w.bar.toFixed(2)} bar (leader ${w.topScore.toFixed(2)} minus margin ${w.margin.toFixed(2)}).`,
      tone: "down",
    });
  }

  return cards;
}

export function findShareCard(data: IntelligencePayload, id: string): ShareCard | null {
  return shareCards(data).find((c) => c.id === id) ?? null;
}
