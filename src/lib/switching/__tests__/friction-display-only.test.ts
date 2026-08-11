import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { frictionBadge } from "@/lib/switching/friction";

/**
 * Dispatch 193. The friction tier is DISPLAY ONLY.
 *
 * Two guarantees are enforced here, both mechanically:
 *  1. No engine, gating or ranking module imports the friction module, so no
 *     ordering decision can take an input from it.
 *  2. The badge never prints a labour estimate.
 */

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

describe("friction tier is display-only", () => {
  it("is imported by no engine, gating or ranking module", () => {
    const roots = ["src/lib/engine", "src/lib/dashboard/plan.ts", "src/lib/switching/savings.server.ts"];
    const files = roots.flatMap((r) => (statSync(r).isDirectory() ? walk(r) : [r]));
    const offenders = files.filter(
      (f) => /\.tsx?$/.test(f) && readFileSync(f, "utf8").includes("switching/friction"),
    );
    expect(offenders).toEqual([]);
  });

  it("is attached after gateLevel has already ranked every list", () => {
    const src = readFileSync("src/lib/dashboard.server.ts", "utf8");
    const ranked = src.indexOf("const oversized = oversizedLevel.items;");
    const attached = src.indexOf("friction: frictionBadge({");
    expect(ranked).toBeGreaterThan(0);
    expect(attached).toBeGreaterThan(ranked);
    // gateLevel's comparators must still read money and nothing else.
    expect(src).toContain("(r) => r.saving");
    expect(src).not.toMatch(/sort\([^)]*friction/);
  });

  it("never prints an effort estimate", () => {
    const badge = frictionBadge({
      fromHost: "openai",
      toHost: "amazon-bedrock",
      fromModel: "a",
      toModel: "b",
      sameModel: false,
      signals: { peakTotalTokens: 8000, events: 100 },
      from: { modality: "text->text", contextWindow: 128000, isReasoning: false },
      to: { modality: "text->text", contextWindow: 200000, isReasoning: false },
    });
    const text = [badge.summary, ...badge.parity.map((p) => p.detail)].join(" ");
    expect(text).not.toMatch(/\b(hours?|hrs?|days? of work|engineer|man-|story point|sprint)\b/i);
    expect(badge.revalidationRecommended).toBe(true);
  });
});

describe("friction tier", () => {
  const caps = { modality: "text->text", contextWindow: 128000, isReasoning: false };

  it("calls an identical-shape, same-model host move low friction", () => {
    const b = frictionBadge({
      fromHost: "openai",
      toHost: "azure",
      fromModel: "gpt-4o",
      toModel: "gpt-4o",
      sameModel: true,
      signals: { peakTotalTokens: 5000, events: 10 },
      from: caps,
      to: caps,
    });
    expect(b.apiDistance).toBe("same-shape");
    expect(b.tier).toBe("low");
    expect(b.revalidationRecommended).toBe(false);
  });

  it("calls a structurally different envelope higher friction", () => {
    const b = frictionBadge({
      fromHost: "anthropic",
      toHost: "cohere",
      fromModel: "claude",
      toModel: "command",
      sameModel: false,
      signals: { peakTotalTokens: 5000, events: 10 },
      from: caps,
      to: caps,
    });
    expect(b.apiDistance).toBe("different-shape");
    expect(b.tier).toBe("high");
  });

  it("flags a candidate whose context window is smaller than the measured peak", () => {
    const b = frictionBadge({
      fromHost: "openai",
      toHost: "groq",
      fromModel: "gpt-4o",
      toModel: "small",
      sameModel: false,
      signals: { peakTotalTokens: 64108, events: 900 },
      from: caps,
      to: { ...caps, contextWindow: 32000 },
    });
    const ctx = b.parity.find((p) => p.label === "Context length");
    expect(ctx?.status).toBe("risk");
    expect(ctx?.detail).toContain("64,108");
    expect(b.tier).toBe("high");
  });

  it("reports tool calling and prompt caching as unobservable, never as a pass", () => {
    const b = frictionBadge({
      fromHost: "openai",
      toHost: "openai",
      fromModel: "a",
      toModel: "a",
      sameModel: true,
      signals: null,
      from: caps,
      to: caps,
    });
    const c = b.parity.find((p) => p.label.startsWith("Tool calling"));
    expect(c?.status).toBe("unobservable");
  });
});
