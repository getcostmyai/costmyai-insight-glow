import { describe, expect, it } from "vitest";

import { deriveDataState, emptyCopy } from "../onboarding";

/**
 * "Nothing to save" and "no data yet" are different sentences. Conflating them
 * told a brand-new workspace that its check had run and found nothing, which is
 * both wrong and the worst possible first impression.
 */

describe("data state", () => {
  it("is awaiting_first_event when the workspace has never ingested anything", () => {
    expect(deriveDataState({ hasEverIngested: false, rowsInWindow: 0 })).toBe(
      "awaiting_first_event",
    );
  });

  it("is warming_up when traffic exists but none landed in the selected window", () => {
    expect(deriveDataState({ hasEverIngested: true, rowsInWindow: 0 })).toBe("warming_up");
  });

  it("is ready as soon as the window has traffic", () => {
    expect(deriveDataState({ hasEverIngested: true, rowsInWindow: 42 })).toBe("ready");
  });
});

describe("empty-state copy", () => {
  it("says the check found nothing only when there was traffic to check", () => {
    const copy = emptyCopy("ready", "host_arbitrage");
    expect(copy.title).toMatch(/already on/i);
    expect(copy.tone).toBe("good");
  });

  it("never claims a completed check for a workspace with no traffic", () => {
    const copy = emptyCopy("awaiting_first_event", "host_arbitrage");
    expect(copy.tone).toBe("waiting");
    expect(copy.title).toMatch(/waiting for your first/i);
    expect(copy.title).not.toMatch(/already|no .* left|optimal/i);
  });

  it("distinguishes a quiet window from an empty account", () => {
    const warming = emptyCopy("warming_up", "quality_match");
    expect(warming.tone).toBe("waiting");
    expect(warming.title).not.toEqual(emptyCopy("awaiting_first_event", "quality_match").title);
  });
});
