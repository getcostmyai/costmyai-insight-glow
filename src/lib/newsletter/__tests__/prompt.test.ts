// @vitest-environment jsdom
/**
 * The slide-in is a once-ever thing. These tests pin the two rules that make it
 * so: where it is allowed to appear at all, and the fact that both dismissal
 * and an actual subscription retire it permanently, across either store.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  EMPTY_PROMPT_STATE,
  PROMPT_COOKIE,
  PROMPT_STORAGE_KEY,
  isPromptEligiblePath,
  markPromptDismissed,
  markSubscribed,
  readPromptState,
  shouldShowPrompt,
} from "../prompt";

function clearAll() {
  window.localStorage.clear();
  document.cookie = `${PROMPT_COOKIE}=; path=/; max-age=0`;
}

beforeEach(clearAll);

describe("prompt route eligibility", () => {
  it("allows the four content surfaces, including nested paths", () => {
    for (const path of [
      "/intelligence",
      "/intelligence/2026-07",
      "/intelligence/notes/deepseek",
      "/blog",
      "/blog/some-post",
      "/reports/cheapest-api-calls",
      "/guides/ai-cost-management",
    ]) {
      expect(isPromptEligiblePath(path), path).toBe(true);
    }
  });

  it("never appears on conversion, auth, partner or workspace surfaces", () => {
    for (const path of [
      "/",
      "/pricing",
      "/auth",
      "/auth/reset-password",
      "/partners",
      "/partners/apply",
      "/workspace",
      "/workspace/govern",
      "/billing",
      "/admin/leads",
      "/demo/compare",
    ]) {
      expect(isPromptEligiblePath(path), path).toBe(false);
    }
  });

  it("ignores query strings, hashes and trailing slashes", () => {
    expect(isPromptEligiblePath("/blog/")).toBe(true);
    expect(isPromptEligiblePath("/intelligence?card=kpi-moves")).toBe(true);
    expect(isPromptEligiblePath("/pricing?utm_source=x")).toBe(false);
  });
});

describe("once-ever suppression", () => {
  it("shows on an eligible path with a clean slate", () => {
    expect(shouldShowPrompt("/blog/post", EMPTY_PROMPT_STATE)).toBe(true);
  });

  it("stops after a dismissal, and the dismissal survives a fresh read", () => {
    markPromptDismissed();
    const state = readPromptState();
    expect(state.dismissed).toBe(true);
    expect(shouldShowPrompt("/blog/post", state)).toBe(false);
  });

  it("stops after subscribing anywhere, even without a dismissal", () => {
    markSubscribed();
    const state = readPromptState();
    expect(state.subscribed).toBe(true);
    expect(state.dismissed).toBe(false);
    expect(shouldShowPrompt("/intelligence", state)).toBe(false);
  });

  it("subscribing outranks a previous dismissal and is never downgraded", () => {
    markPromptDismissed();
    markSubscribed();
    const state = readPromptState();
    expect(state).toEqual({ dismissed: true, subscribed: true });
    expect(shouldShowPrompt("/intelligence", state)).toBe(false);
  });

  it("remembers via the cookie alone when localStorage is wiped", () => {
    markPromptDismissed();
    window.localStorage.clear();
    expect(readPromptState().dismissed).toBe(true);
  });

  it("remembers via localStorage alone when the cookie is cleared", () => {
    markSubscribed();
    document.cookie = `${PROMPT_COOKIE}=; path=/; max-age=0`;
    expect(readPromptState().subscribed).toBe(true);
  });

  it("treats unreadable stored state as 'not yet seen' rather than crashing", () => {
    window.localStorage.setItem(PROMPT_STORAGE_KEY, "{not json");
    expect(readPromptState()).toEqual(EMPTY_PROMPT_STATE);
  });
});
