/**
 * PostgREST returns at most 1000 rows unless a larger limit is asked for.
 * The live price table already exceeds that, so every read of the catalogue,
 * the price table or the benchmark table must raise the ceiling explicitly —
 * a silently truncated page would hide part of the market from the engine and
 * let it recommend a "cheapest host" that simply fell off the first page.
 */
export const MAX_CATALOG_ROWS = 50_000;
