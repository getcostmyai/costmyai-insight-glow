import { describe, expect, it, vi } from "vitest";

import { K_ANONYMITY_FLOOR, candidateCuts, resolveBucket } from "../k-anonymity";
import { checkAnswers } from "../sanity";
import { BENCHMARK_ASK_THRESHOLD, askThresholdMet } from "../ask-gate";
import { buildBenchmark } from "../benchmark.server";

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

/**
 * Dispatch 123. The ask-gate: the four optional questions are only asked once
 * the platform could plausibly assemble any cohort at all.
 */
describe("ask gate", () => {
  const profile = {
    org_id: "o1",
    use_case: "customer_facing",
    use_case_other: null,
    industry: "SaaS / software",
    revenue_band: null,
    headcount_band: null,
    customer_facing: null,
    maturity: null,
    quality_flag: null,
    primer_seen_at: null,
    benchmark_prompt_dismissed_at: null,
  };

  const clientWith = (eligible: number, cohort = 40) => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ eq: () => ({ gte: async () => ({ data: [{ cost_usd: 1000 }], error: null }) }) }),
        }),
      }),
    }),
    rpc: async (fn: string) =>
      fn === "benchmark_eligible_companies"
        ? { data: eligible, error: null }
        : { data: [{ company_count: cohort, p25_usd: 100, p50_usd: 200, p75_usd: 300 }], error: null },
  });

  it("threshold sits above the k-anonymity floor", () => {
    expect(BENCHMARK_ASK_THRESHOLD).toBeGreaterThan(K_ANONYMITY_FLOOR);
    expect(askThresholdMet(BENCHMARK_ASK_THRESHOLD - 1)).toBe(false);
    expect(askThresholdMet(BENCHMARK_ASK_THRESHOLD)).toBe(true);
  });

  it("defers the four questions below the threshold", async () => {
    const view = await buildBenchmark(clientWith(1) as never, profile as never, "o1");
    expect(view.state).toBe("too_early");
    if (view.state !== "too_early") return;
    expect(view.eligibleCompanies).toBe(1);
    expect(view.threshold).toBe(BENCHMARK_ASK_THRESHOLD);
  });

  it("flips to asking once the eligible pool crosses the threshold", async () => {
    const view = await buildBenchmark(
      clientWith(BENCHMARK_ASK_THRESHOLD) as never,
      profile as never,
      "o1",
    );
    expect(view.state).toBe("locked");
  });

  it("never re-gates a workspace that already answered", async () => {
    // Eligible pool of zero, but this workspace has an answer on file: the
    // honest state is the k=5 cohort refusal, never a withdrawal of the ask.
    const answered = { ...profile, revenue_band: "1m_10m" };
    const client = clientWith(0, 1);
    const view = await buildBenchmark(client as never, answered as never, "o1");
    expect(view.state).toBe("refused");
  });

  it("shows the real comparison from stored answers once the cohort is large enough", async () => {
    const answered = { ...profile, revenue_band: "1m_10m" };
    const view = await buildBenchmark(clientWith(0, 40) as never, answered as never, "o1");
    expect(view.state).toBe("shown");
  });
});
