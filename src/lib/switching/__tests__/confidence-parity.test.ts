import { describe, expect, it } from "vitest";

import { frictionBadge, type FrictionInput } from "@/lib/switching/friction";
import type { ShapeConfidence } from "@/lib/ingest/provider-shapes";

/**
 * Mapper confidence must reach the friction tier: an "assumed" envelope shape
 * can no longer read as low friction.
 */

const caps = { modality: "text->text", contextWindow: 128000, isReasoning: false };

const base = (
  fromConfidence: ShapeConfidence | null,
  toConfidence: ShapeConfidence | null,
): FrictionInput => ({
  fromHost: "openai",
  toHost: "azure",
  fromModel: "gpt-4o",
  toModel: "gpt-4o",
  sameModel: true,
  signals: { peakTotalTokens: 5000, events: 10 },
  from: caps,
  to: caps,
  fromConfidence,
  toConfidence,
});

describe("envelope-confidence parity", () => {
  it("preserves low friction when both sides are verified", () => {
    expect(frictionBadge(base("verified", "verified")).tier).toBe("low");
  });

  it("preserves low friction when both sides are documented", () => {
    expect(frictionBadge(base("documented", "documented")).tier).toBe("low");
  });

  it("preserves low friction for one verified and one documented side", () => {
    expect(frictionBadge(base("verified", "documented")).tier).toBe("low");
  });

  it("lifts an assumed incumbent out of low friction", () => {
    const b = frictionBadge(base("assumed", "verified"));
    expect(b.tier).not.toBe("low");
    expect(b.tier).toBe("moderate");
    const c = b.parity.find((p) => /envelope confidence/i.test(p.label) && p.status === "unknown");
    expect(c).toBeDefined();
  });

  it("lifts an assumed candidate out of low friction", () => {
    const b = frictionBadge(base("verified", "assumed"));
    expect(b.tier).toBe("moderate");
    expect(
      b.parity.some((p) => /envelope confidence/i.test(p.label) && p.status === "unknown"),
    ).toBe(true);
  });

  it("dedupes identical sides on the same host", () => {
    const b = frictionBadge({ ...base("verified", "verified"), toHost: "openai" });
    const labels = b.parity.filter((p) => /envelope confidence/i.test(p.label)).map((p) => p.label);
    expect(labels).toEqual(["Envelope confidence"]);
  });
});
