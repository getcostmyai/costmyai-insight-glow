/**
 * Content guards for the public front page.
 * These tests verify that competitive-positioning claims are present,
 * attributed correctly, and located near the Neutrality Charter framing.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const HOME = readFileSync("src/routes/index.tsx", "utf8");

describe("front-page competitive positioning", () => {
  it("names Auriko and contrasts internal reports with independent benchmarks", () => {
    expect(HOME).toMatch(/Auriko/);
    expect(HOME).toMatch(/internal report/i);
    expect(HOME).toMatch(/independent benchmark/i);
    expect(HOME).toMatch(/independent, third-party verification/i);
  });

  it("states the refusal standard for unverified switches", () => {
    expect(HOME).toMatch(/refuse to certify/i);
    expect(HOME).toMatch(/global routing dial/i);
    expect(HOME).toMatch(/per-workload proof/i);
    expect(HOME).toMatch(/refusal and the reason/i);
  });

  it("places the Auriko differentiator inside the Neutrality Charter section", () => {
    const charterIndex = HOME.indexOf("Neutrality Charter");
    const aurikoIndex = HOME.indexOf("Auriko");
    expect(charterIndex).toBeGreaterThan(-1);
    expect(aurikoIndex).toBeGreaterThan(-1);
    // The callout must appear after the section header and before the next major section.
    expect(aurikoIndex).toBeGreaterThan(charterIndex);
    const nextSection = HOME.indexOf("/* -------------------------------- 10 · faq", aurikoIndex);
    expect(nextSection).toBeGreaterThan(aurikoIndex);
  });
});
