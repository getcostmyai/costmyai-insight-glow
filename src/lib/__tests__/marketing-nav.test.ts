/**
 * Structural guards for the public nav and the two pages added with it.
 * These are the claims a reader of the header relies on: a fixed order, a
 * sign-in affordance that is driven by the session rather than hardcoded, and
 * no live-demo link leaking onto a public surface.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { APP_NAV, MARKETING_NAV } from "@/lib/nav";

const SHELL = readFileSync("src/components/marketing/MarketingShell.tsx", "utf8");
const DASH = readFileSync("src/components/dashboard/DashboardShell.tsx", "utf8");
const INTELLIGENCE = readFileSync("src/routes/intelligence.index.tsx", "utf8");
const PARTNERS = readFileSync("src/routes/partners.tsx", "utf8");

describe("marketing nav", () => {
  it("lists the sections in the agreed order", () => {
    expect(MARKETING_NAV.map((i) => i.label)).toEqual([
      "How it works",
      "Models",
      "Intelligence",
      "Become a Partner",
      "Blog",
      "Pricing",
    ]);
  });

  it("is the single source both shells render from", () => {
    // Neither shell may declare its own list again.
    expect(SHELL).toMatch(/const NAV = MARKETING_NAV/);
    expect(DASH).toMatch(/const topNav = APP_NAV/);
    expect(SHELL).not.toMatch(/label:\s*"/);
    expect(DASH).not.toMatch(/to:\s*"\/pricing"/);
  });

  it("gives the signed-in header the same order, minus marketing-only entries", () => {
    expect(APP_NAV.map((i) => i.label)).toEqual([
      "Models",
      "Intelligence",
      "Become a Partner",
      "Blog",
      "Pricing",
    ]);
    // One route, one label: "Plans" is gone for good.
    expect(APP_NAV.some((i) => i.label === "Plans")).toBe(false);
    expect(APP_NAV.find((i) => i.label === "Pricing")?.to).toBe("/pricing");
  });


  it("keeps the wordmark pointing at home", () => {
    expect(SHELL).toMatch(/<Link to="\/"[^>]*>\s*<Wordmark/);
  });

  it("shows Book a Demo and Start free as two buttons, not a text link", () => {
    expect(SHELL).toMatch(/BOOK_DEMO_URL[\s\S]{0,400}rounded-full border[\s\S]{0,200}Book a Demo/);
    expect(SHELL).toMatch(/btn-gradient[\s\S]{0,80}Start free/);
    // "Book a Demo" must not reappear as a plain nav entry.
    expect(SHELL).not.toMatch(/label:\s*"Book a Demo"/);
  });

  it("drives the account icon off the session, with two distinct icons", () => {
    expect(SHELL).toMatch(/onAuthStateChange/);
    expect(SHELL).toMatch(/signedIn\s*\?\s*\(?\s*<CircleUserRound/);
    expect(SHELL).toMatch(/:\s*\(?\s*<LogIn/);

    expect(SHELL).toMatch(/aria-label=\{signedIn \?/);
  });

  it("advertises no live demo on any public surface", () => {
    expect(SHELL).not.toMatch(/Live demo|See it on live data|Open the live demo/i);
  });
});

describe("new public pages", () => {
  it("each ships its own unique head metadata", () => {
    for (const src of [INTELLIGENCE, PARTNERS]) {
      expect(src).toMatch(/head:\s*\(\)\s*=>/);
      expect(src).toMatch(/name:\s*"description"/);
      expect(src).toMatch(/property:\s*"og:title"/);
      expect(src).not.toMatch(/Lovable/);
    }
    const title = (s: string) => /title:\s*"([^"]+)"/.exec(s)?.[1];
    expect(title(INTELLIGENCE)).toBeTruthy();
    expect(title(PARTNERS)).toBeTruthy();
    expect(title(INTELLIGENCE)).not.toBe(title(PARTNERS));
  });

  it("the partner page reads its ladder from the database", () => {
    expect(PARTNERS).toMatch(/partnerLadderQuery/);
    expect(PARTNERS).toMatch(/ladder\.tiers\.map/);
  });
});
