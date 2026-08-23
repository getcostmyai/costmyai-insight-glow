import type { IntelligencePayload } from "./intelligence.server";
import { moveCardId, spreadCardId } from "./share-cards";

/**
 * Derived readings of a month, for the reader who came to quote us.
 *
 * Everything here is a pure function of the payload the page already renders,
 * chosen by a fixed rule rather than by editorial taste. That matters twice
 * over: the live page and the frozen month agree by construction, and nobody
 * can accuse us of picking the flattering number after seeing the data.
 */

const signedPct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
const usd = (n: number) => (n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(n < 0.01 ? 4 : 3)}`);

export interface Highlight {
  /** Anchor id of the card this reading points at, so a share resolves to it. */
  cardId: string;
  value: string;
  label: string;
  detail: string;
  tone: "up" | "down";
}

/**
 * The single figure of the month.
 *
 * Rule: the largest magnitude among the biggest cut, the biggest rise and the
 * widest provider spread. Ties resolve in that stated order, so the choice is
 * reproducible from the payload alone.
 */
export function numberOfTheMonth(data: IntelligencePayload): Highlight | null {
  const candidates: { rank: number; score: number; highlight: Highlight }[] = [];

  const cut = [...(data.topDecreases ?? [])].sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))[0];
  if (cut) {
    candidates.push({
      rank: 0,
      score: Math.abs(cut.pct),
      highlight: {
        cardId: moveCardId("decrease", cut.modelKey, cut.host),
        value: signedPct(cut.pct),
        label: `${cut.modelKey} at ${cut.hostLabel}`,
        detail: `The steepest cut recorded in ${data.monthLabel}, blended across input and output.`,
        tone: "down",
      },
    });
  }

  const rise = [...(data.topIncreases ?? [])].sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))[0];
  if (rise) {
    candidates.push({
      rank: 1,
      score: Math.abs(rise.pct),
      highlight: {
        cardId: moveCardId("increase", rise.modelKey, rise.host),
        value: signedPct(rise.pct),
        label: `${rise.modelKey} at ${rise.hostLabel}`,
        detail: `The steepest rise recorded in ${data.monthLabel}, blended across input and output.`,
        tone: "up",
      },
    });
  }

  const spread = [...(data.spreads ?? [])].sort((a, b) => b.spreadPct - a.spreadPct)[0];
  if (spread) {
    candidates.push({
      rank: 2,
      score: spread.spreadPct,
      highlight: {
        cardId: spreadCardId(spread.modelKey),
        value: `+${Math.round(spread.spreadPct)}%`,
        label: `${spread.displayName}, same weights`,
        detail: `${usd(spread.cheapest)} at ${spread.cheapestHost} against ${usd(spread.dearest)} at ${spread.dearestHost}, per MTok in.`,
        tone: "up",
      },
    });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score || a.rank - b.rank);
  return candidates[0]!.highlight;
}

/**
 * The month in one quotable sentence. A donut cannot be pasted into a post.
 */
export function directionLine(data: IntelligencePayload): string | null {
  const total = data.increases + data.decreases;
  if (total === 0) return null;
  const cutShare = Math.round((data.decreases / total) * 100);
  const verdict =
    data.decreases > data.increases
      ? "the market moved down on balance"
      : data.increases > data.decreases
        ? "the market moved up on balance"
        : "the market was evenly split";

  return `${total} recorded price moves in ${data.monthLabel}: ${data.decreases} cuts and ${data.increases} rises, so ${verdict}. ${cutShare}% of all moves were cuts.`;
}

/** The window the figures cover, stated where the figures are, not in a footnote. */
export function trackingWindow(
  data: IntelligencePayload,
  now: Date = new Date(data.generatedAt),
): string | null {
  if (!data.trackingSince) return null;
  const since = new Date(data.trackingSince);
  const days = Math.max(1, Math.round((now.getTime() - since.getTime()) / 86_400_000));
  const label = since.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return `Recording began ${label}, so every count here covers a ${days}-day window, not a full year.`;
}

export function citationLine(opts: {
  monthLabel: string;
  url: string;
  retrievedAt: Date;
}): string {
  const retrieved = opts.retrievedAt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return `CostMyAI Intelligence, ${opts.monthLabel}. Retrieved ${retrieved}. ${opts.url}`;
}

/**
 * A ready post: the figure, the window it covers, and where it came from.
 * Three lines, no adjectives, so the poster can quote it without checking it.
 */
export function postDraft(opts: {
  value: string;
  label: string;
  detail: string;
  window?: string | null;
  url: string;
}): string {
  return [
    `${opts.value} — ${opts.label}`,
    opts.detail,
    opts.window ?? null,
    `Source: CostMyAI Intelligence. ${opts.url}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
