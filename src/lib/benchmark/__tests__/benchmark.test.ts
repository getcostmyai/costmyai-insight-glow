import { describe, expect, it, vi } from "vitest";

import { K_ANONYMITY_FLOOR, candidateCuts, resolveBucket } from "../k-anonymity";
import { checkAnswers } from "../sanity";

/**
 * The floor is the whole feature. A benchmark that can resolve to one
 * identifiable company is worse than no benchmark, so these tests attack the
 * narrow cut deliberately.
 */

const dims = { industry: "SaaS / software", useCase: "customer_facing", revenueBand: "1m_10m" };

describe("bucket ladder", () => {
  it("orders cuts narrow to wide and drops industry first", () => {
    const cuts = candidateCuts(dims);
    expect(cuts[0]).toMatchObject({ industry: "SaaS / software", useCase: "customer_facing", revenueBand: "1m_10m" });
    expect(cuts[1]).toMatchObject({ industry: null, useCase: "customer_facing", revenueBand: "1m_10m" });
    expect(cuts[2]).toMatchObject({ industry: null, useCase: null, revenueBand: "1m_10m" });
  });

  it("never buckets on the unstructured 'other' use case", () => {
    const cuts = candidateCuts({ industry: null, useCase: "other", revenueBand: "1m_10m" });
    expect(cuts.every((c) => c.useCase === null)).toBe(true);
  });
});

describe("k-anonymity floor", () => {
  it("widens rather than resolving a near-unique bucket", async () => {
    // One company in the exact cut; the cohort only exists once industry drops.
    const countFor = vi.fn(async (cut: { industry: string | null }) => (cut.industry ? 1 : 12));
    const res = await resolveBucket(dims, countFor);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.widened).toBe(true);
    expect(res.cut.industry).toBeNull();
    expect(res.companyCount).toBeGreaterThanOrEqual(K_ANONYMITY_FLOOR);
  });

  it("refuses outright when even the widest cut is small", async () => {
    const res = await resolveBucket(dims, async () => K_ANONYMITY_FLOOR - 1);
    expect(res).toEqual({ ok: false, reason: "below_floor", floor: K_ANONYMITY_FLOOR });
  });

  it("never resolves a cut that could be a single company", async () => {
    for (const n of [0, 1, 2, 3, 4]) {
      const res = await resolveBucket(dims, async () => n);
      expect(res.ok).toBe(false);
    }
  });

  it("refuses when the user answered nothing that can be bucketed", async () => {
    const res = await resolveBucket({ useCase: "other" }, async () => 1000);
    expect(res).toEqual({ ok: false, reason: "no_dimensions", floor: K_ANONYMITY_FLOOR });
  });
});

describe("data quality guard", () => {
  it("flags a tiny team in an enterprise revenue band without blocking", () => {
    const v = checkAnswers({ headcountBand: "1_9", revenueBand: "gt_250m" });
    expect(v.flag).toBe("implausible_scale");
    expect(v.warning).toBeTruthy();
  });

  it("stays quiet on a plausible combination", () => {
    expect(checkAnswers({ headcountBand: "50_249", revenueBand: "10m_50m" }).flag).toBeNull();
  });

  it("notices a use case that contradicts signup", () => {
    expect(checkAnswers({ useCase: "internal", customerFacing: true }).flag).toBe("conflicting_use_case");
  });
});
