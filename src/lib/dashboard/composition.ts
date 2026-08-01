/**
 * How the counts on the four level pages relate to each other.
 *
 * Compare shows arbitrage candidates, Certify shows benchmark-certified ones,
 * Rightsize shows oversized workloads, and Govern looks at *all three* and
 * splits them into "would run unattended" and "held for a human". That is the
 * real composition rule, so it lives in one place and is asserted by a test
 * rather than being something a customer has to reverse-engineer from screens.
 */
export interface LevelComposition {
  /** Compare — same model, cheaper host. */
  arbitrageCount: number;
  /** Certify — different model, quality proven. */
  qualityCount: number;
  /** Rightsize — oversized model with a smaller target. */
  oversizedCount: number;
  /** Everything Govern looked at = the three above, when a target exists. */
  consideredCount: number;
  eligibleCount: number;
  refusedCount: number;
}

export function buildComposition(input: {
  arbitrageCount: number;
  qualityCount: number;
  oversizedCount: number;
  eligibleCount: number;
  refusedCount: number;
}): LevelComposition {
  return {
    ...input,
    consideredCount: input.eligibleCount + input.refusedCount,
  };
}

/** True when Govern's two lists account for every candidate the levels show. */
export function compositionBalances(c: LevelComposition): boolean {
  return (
    c.eligibleCount + c.refusedCount === c.consideredCount &&
    c.consideredCount <= c.arbitrageCount + c.qualityCount + c.oversizedCount
  );
}

/** One sentence a customer can read instead of comparing five screens. */
export function compositionSentence(c: LevelComposition): string {
  return `Govern looks at all ${c.consideredCount} candidates the earlier levels found — ${c.arbitrageCount} cheaper-host, ${c.qualityCount} quality-matched, ${c.oversizedCount} oversized — and splits them into ${c.eligibleCount} that clear the autonomous gate and ${c.refusedCount} held for you.`;
}
