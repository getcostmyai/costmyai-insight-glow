/**
 * The limiter's whole point is that it is shared. A test that runs one counter
 * in one process would pass against the old per-isolate Map too, so this test
 * fires concurrent requests at one bucket key and asserts the total number of
 * allowed calls equals the limit exactly — the property a per-isolate counter
 * cannot have.
 */
import { describe, expect, it } from "vitest";

import { RATE_RULES, consumeRateLimit } from "@/lib/rate-limit.server";

const rule = (limit: number) => ({ name: "test-limiter", limit, windowSec: 120 });

describe("shared rate limiter", () => {
  it("admits exactly `limit` of many concurrent hits on one key", async () => {
    const identity = `vitest-${crypto.randomUUID()}`;
    const r = rule(10);

    const verdicts = await Promise.all(
      Array.from({ length: 40 }, () => consumeRateLimit(r, identity)),
    );

    expect(verdicts.filter((v) => v.ok)).toHaveLength(10);
    expect(verdicts.filter((v) => !v.ok)).toHaveLength(30);
    expect(verdicts.filter((v) => !v.ok).every((v) => v.retryAfterSec > 0)).toBe(true);
  }, 30_000);

  it("keeps separate budgets per endpoint and per caller", async () => {
    const a = `vitest-${crypto.randomUUID()}`;
    const b = `vitest-${crypto.randomUUID()}`;
    const r = rule(1);

    expect((await consumeRateLimit(r, a)).ok).toBe(true);
    expect((await consumeRateLimit(r, a)).ok).toBe(false);
    // A different caller is untouched by the first one's exhaustion.
    expect((await consumeRateLimit(r, b)).ok).toBe(true);
    // A different rule name is a different budget for the same caller.
    expect((await consumeRateLimit({ ...r, name: "test-limiter-2" }, a)).ok).toBe(true);
  }, 30_000);

  it("prices each public endpoint against its abuse shape", () => {
    // The email-sending endpoint must always be the strictest.
    expect(RATE_RULES.partnerApplication.limit).toBeLessThan(RATE_RULES.estimator.limit);
    // Ingest is generous but keyed per workspace, never globally.
    expect(RATE_RULES.ingest.limit).toBeGreaterThan(RATE_RULES.widgetDoc.limit);
  });
});
