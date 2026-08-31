import { describe, expect, it } from "vitest";

import {
  generateToken,
  isPlausibleToken,
  isValidEmail,
  normalizeEmail,
  normalizeSource,
} from "../newsletter";

describe("newsletter input validation", () => {
  it("accepts ordinary addresses and normalizes them for the lower(email) index", () => {
    expect(isValidEmail("  Rob@CostMyAI.com ")).toBe(true);
    expect(normalizeEmail("  Rob@CostMyAI.com ")).toBe("rob@costmyai.com");
  });

  it("rejects the shapes a signup form actually receives", () => {
    for (const bad of ["", "   ", "rob", "rob@", "@costmyai.com", "rob costmyai.com", "rob@costmyai", null, 42]) {
      expect(isValidEmail(bad as never)).toBe(false);
    }
  });

  it("refuses an address long enough to be a payload rather than a mailbox", () => {
    expect(isValidEmail(`${"a".repeat(240)}@costmyai.com`)).toBe(false);
  });

  it("clamps the source string so the form is not a free write channel", () => {
    expect(normalizeSource("Footer Form")).toBe("footer-form");
    expect(normalizeSource("<script>alert(1)</script>")).toBe("-script-alert-1---script-");
    expect(normalizeSource("x".repeat(200))?.length).toBe(60);
    expect(normalizeSource(null)).toBeNull();
    expect(normalizeSource("   ")).toBeNull();
  });
});

describe("newsletter tokens", () => {
  it("mints 256 bits of hex that the plausibility check accepts", () => {
    const token = generateToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(isPlausibleToken(token)).toBe(true);
  });

  it("does not repeat across a batch", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateToken()));
    expect(tokens.size).toBe(200);
  });

  it("rejects anything that is not a full-length hex token", () => {
    for (const bad of ["", "abc", "z".repeat(64), generateToken().slice(0, 63), null, {}]) {
      expect(isPlausibleToken(bad as never)).toBe(false);
    }
  });
});
