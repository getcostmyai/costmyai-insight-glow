/**
 * What counts as a provider.
 *
 * The OpenRouter feed publishes two kinds of row for the same weights: a
 * per-endpoint row (a real company serving the model) and one aggregate
 * listing row that represents "buy it through OpenRouter". The aggregate is a
 * real purchasable option, so it stays in the price table and is shown where we
 * list purchasable options — but it is not a provider, and it does not serve
 * weights.
 *
 * Every claim of the form "N providers", "same weights at a different
 * provider", or "the cheapest provider for this model" must therefore be
 * computed over real endpoints only. That rule used to live as a private
 * filter inside whichever file needed it, which is exactly how the Intelligence
 * page came to publish 71 providers while the market-structure section on the
 * same page already knew there were 70 (Dispatch 116/117).
 *
 * One definition, imported everywhere. There is no second copy of this string.
 */
export const AGGREGATE_PRICE_SOURCE = "openrouter-aggregate";

/** A row that a real company serves, as opposed to the aggregate listing. */
export function isRealEndpoint<T extends { price_source?: string | null }>(row: T): boolean {
  return row.price_source !== AGGREGATE_PRICE_SOURCE;
}

/**
 * The canonical "providers tracked" figure: distinct real hosts holding at
 * least one live price. Every surface that states a provider count calls this.
 */
export function countRealProviders<T extends { host: string; price_source?: string | null }>(
  rows: T[],
): number {
  return new Set(rows.filter(isRealEndpoint).map((r) => r.host)).size;
}
