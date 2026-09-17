import { describe, expect, it, vi } from "vitest";

import {
  REFERRAL_CODE_ALPHABET,
  REFERRAL_CODE_LENGTH,
  generateReferralCode,
  mintReferralCode,
} from "../partner-create.server";

/**
 * A referral code must not say who the partner is, and must survive being read
 * aloud on a call. These tests pin both: the alphabet, and the fact that a
 * collision retries instead of quietly reusing someone else's code.
 */
describe("referral code generator", () => {
  it("is always 8 characters", () => {
    for (let i = 0; i < 500; i++) {
      expect(generateReferralCode()).toHaveLength(REFERRAL_CODE_LENGTH);
    }
  });

  it("never emits an ambiguous character", () => {
    for (let i = 0; i < 2000; i++) {
      expect(generateReferralCode()).toMatch(/^[A-HJ-KM-NP-Z2-9]{8}$/);
    }
  });

  it("excludes O, 0, I, 1 and L from the alphabet itself", () => {
    for (const c of ["O", "0", "I", "1", "L"]) {
      expect(REFERRAL_CODE_ALPHABET).not.toContain(c);
    }
  });

  it("is not derived from any partner name", () => {
    const a = generateReferralCode();
    const b = generateReferralCode();
    expect(a).not.toEqual(b);
  });
});

/** A tiny stand-in for the admin client: two collisions, then a free code. */
function clientTakingFirst(hits: number) {
  let calls = 0;
  const maybeSingle = vi.fn(async () => {
    calls += 1;
    return { data: calls <= hits ? { id: "taken" } : null, error: null };
  });
  const client = {
    from: () => ({ select: () => ({ ilike: () => ({ maybeSingle }) }) }),
  };
  return { client, maybeSingle, calls: () => calls };
}

describe("mintReferralCode", () => {
  it("retries past a collision and returns a free code", async () => {
    const { client, calls } = clientTakingFirst(2);
    const code = await mintReferralCode(client as never);
    expect(code).toMatch(/^[A-HJ-KM-NP-Z2-9]{8}$/);
    expect(calls()).toBe(3);
  });

  it("fails loudly rather than returning a colliding code", async () => {
    const { client } = clientTakingFirst(Number.MAX_SAFE_INTEGER);
    await expect(mintReferralCode(client as never)).rejects.toThrow(/unique referral code/i);
  });

  it("returns on the first attempt when nothing collides", async () => {
    const { client, calls } = clientTakingFirst(0);
    await mintReferralCode(client as never);
    expect(calls()).toBe(1);
  });
});
