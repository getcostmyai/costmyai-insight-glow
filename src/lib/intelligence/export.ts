import type { IntelligencePayload } from "./intelligence.server";
import { shareCards } from "./share-cards";

/**
 * Machine-readable exports of a month.
 *
 * The rows are generated from the same `shareCards` vocabulary the page and the
 * share images read, so a downloaded file cannot disagree with the page it came
 * from. There is deliberately no second formatter here.
 */

const cell = (value: string): string =>
  /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

export function toCsv(data: IntelligencePayload, month: string): string {
  const lines = [["month", "figure_id", "value", "label", "detail"].join(",")];
  for (const card of shareCards(data)) {
    lines.push([month, card.id, card.value, card.label, card.detail].map(cell).join(","));
  }
  return `${lines.join("\n")}\n`;
}

export function toJson(data: IntelligencePayload, month: string) {
  return {
    source: "CostMyAI Intelligence",
    month,
    monthLabel: data.monthLabel,
    generatedAt: data.generatedAt,
    trackingSince: data.trackingSince,
    licence: "Free to reuse with attribution to CostMyAI.",
    totals: {
      liveModels: data.liveModels,
      liveHosts: data.liveHosts,
      changesTotal: data.changesTotal,
      increases: data.increases,
      decreases: data.decreases,
      newModels: data.newModels,
      newListings: data.newListings,
      multiHostModels: data.multiHostModels,
    },
    figures: shareCards(data),
  };
}
