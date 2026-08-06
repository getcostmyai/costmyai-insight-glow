/**
 * Dispatch 123. When is it honest to ask the four optional questions?
 *
 * The four answers only buy one thing: a spend comparison. That comparison is
 * only ever printed when at least `K_ANONYMITY_FLOOR` real companies stand
 * behind the cut (see `k-anonymity.ts`). So asking before the platform could
 * plausibly assemble any cohort at all collects cohort-classification data
 * that cannot be used — friction with no return, and a privacy cost with no
 * privacy benefit.
 *
 * The gate deliberately does NOT look at the asker's own cohort size. Cohorts
 * are keyed on the answers themselves (industry, use case, revenue band), so
 * "only ask once your cohort has five companies" is circular: revenue band is
 * one of the four questions. The non-circular proxy is the platform-wide pool
 * of benchmark-eligible companies — profiled, real, quality-clean, and
 * actually sending traffic — which is exactly the population `benchmark_cut`
 * draws every cohort from, and is computable without knowing anyone's answers.
 */

/**
 * Eligible companies required platform-wide before the four questions appear.
 *
 * Set well above the k-anonymity floor of 5 rather than at it: the pool splits
 * across industries and use cases before any single cut is measured, so a pool
 * of exactly five could never produce a cohort of five unless every company on
 * the platform happened to answer identically. At 25 a typical
 * industry + use-case cut has a real chance of clearing the floor, and the
 * widening ladder (industry drops first) catches the rest.
 *
 * Mirrors `public.benchmark_ask_threshold()` in the database.
 */
export const BENCHMARK_ASK_THRESHOLD = 25;

/**
 * True when the platform has enough eligible companies that answering could
 * plausibly unlock a real comparison.
 */
export function askThresholdMet(
  eligibleCompanies: number,
  threshold: number = BENCHMARK_ASK_THRESHOLD,
): boolean {
  return Number.isFinite(eligibleCompanies) && eligibleCompanies >= threshold;
}
