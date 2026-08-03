import { BUCKETABLE_USE_CASES, type UseCase } from "./taxonomy";

/**
 * k-anonymity for benchmark cuts.
 *
 * A benchmark is a sentence about other people's money. It is only allowed to
 * exist when enough distinct real companies stand behind it that no single one
 * can be read out of it. That floor is enforced here, before any number is
 * fetched or rendered — not as a later hardening pass — and when a cut cannot
 * clear it the answer is a wider cut or an honest refusal, never a softer
 * number.
 */

/** Distinct real companies required behind any figure we are willing to print. */
export const K_ANONYMITY_FLOOR = 5;

export interface BucketDims {
  industry?: string | null;
  useCase?: string | null;
  revenueBand?: string | null;
}

export interface Cut {
  industry: string | null;
  useCase: string | null;
  revenueBand: string | null;
  /** Plain-language description of who the figure is actually about. */
  label: string;
  /** How many dimensions the cut pins down. Higher is narrower. */
  granularity: number;
}

const clean = (v: string | null | undefined) => (v && v.trim() !== "" ? v : null);

/**
 * Widening ladder, narrowest first.
 *
 * Industry is dropped first because it is the most granular dimension and the
 * one most likely to isolate a single company; revenue band is kept longest
 * because it is the primary scale proxy and the comparison is meaningless
 * without some notion of scale.
 */
export function candidateCuts(dims: BucketDims): Cut[] {
  const industry = clean(dims.industry);
  const revenueBand = clean(dims.revenueBand);
  const raw = clean(dims.useCase);
  // "other" is free text at signup and therefore unstructured: it can label a
  // company but it cannot label a cohort.
  const useCase = raw && BUCKETABLE_USE_CASES.includes(raw as UseCase) ? raw : null;

  const cuts: Cut[] = [];
  const push = (c: Omit<Cut, "granularity" | "label">) => {
    const granularity = [c.industry, c.useCase, c.revenueBand].filter(Boolean).length;
    if (granularity === 0) return;
    const parts: string[] = [];
    if (c.industry) parts.push(c.industry.toLowerCase());
    if (c.useCase) parts.push(useCaseWords(c.useCase));
    if (c.revenueBand) parts.push("your revenue band");
    if (cuts.some((x) => x.industry === c.industry && x.useCase === c.useCase && x.revenueBand === c.revenueBand)) {
      return;
    }
    cuts.push({ ...c, granularity, label: parts.join(", ") });
  };

  push({ industry, useCase, revenueBand });
  push({ industry: null, useCase, revenueBand });
  push({ industry: null, useCase: null, revenueBand });
  push({ industry: null, useCase, revenueBand: null });

  return cuts;
}

function useCaseWords(useCase: string) {
  if (useCase === "customer_facing") return "customer-facing AI";
  if (useCase === "internal") return "internal AI tooling";
  return "both customer-facing and internal AI";
}

export type BucketResolution =
  | { ok: true; cut: Cut; companyCount: number; widened: boolean; floor: number }
  | { ok: false; reason: "no_dimensions" | "below_floor"; floor: number };

/**
 * Walk the ladder and stop at the first cut that clears the floor.
 *
 * `countFor` is injected so the rule can be tested against deliberately narrow,
 * near-unique buckets without a database.
 */
export async function resolveBucket(
  dims: BucketDims,
  countFor: (cut: Cut) => Promise<number>,
  floor: number = K_ANONYMITY_FLOOR,
): Promise<BucketResolution> {
  const cuts = candidateCuts(dims);
  if (cuts.length === 0) return { ok: false, reason: "no_dimensions", floor };

  for (let i = 0; i < cuts.length; i++) {
    const cut = cuts[i]!;
    const count = await countFor(cut);
    if (count >= floor) {
      return { ok: true, cut, companyCount: count, widened: i > 0, floor };
    }
  }
  return { ok: false, reason: "below_floor", floor };
}
