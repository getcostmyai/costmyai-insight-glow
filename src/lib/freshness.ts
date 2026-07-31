/**
 * One relative-time formatter for every freshness claim in the product.
 *
 * Freshness is a factual claim about a sync run, so it is formatted in exactly
 * one place — a second copy is how a marketing page ends up rounding
 * differently from the dashboard and quietly contradicting it.
 */
export function relativeAgo(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "never";
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
