import { describe, expect, it } from "vitest";

import { buildShareSvg } from "../share-image.server";
import { asOfLabel, type ShareCard } from "../share-cards";

/**
 * The frozen assertions here are deliberately literal string checks against the
 * pre-fix output. Generalising the renderer to serve the live month too must
 * not have moved a single character of what a permanent citation poster says.
 */
const card: ShareCard = {
  id: "kpi-moves",
  value: "42",
  label: "Price moves in August 2026",
  detail: "20 up, 22 down. New listings are counted separately.",
  tone: "brand",
};

describe("buildShareSvg", () => {
  it("renders a frozen citation exactly as before the live-share fix", () => {
    const svg = buildShareSvg(card, { kind: "frozen", monthKey: "2026-07" });
    expect(svg).toContain("· final, frozen figures");
    expect(svg).toContain("costmyai.com/intelligence/2026-07");
    expect(svg).not.toContain("still moving");
    expect(svg).not.toContain("as of");
  });

  it("labels a live citation as still moving, with no month in the permalink", () => {
    const generatedAt = "2026-08-31T09:05:00.000Z";
    const svg = buildShareSvg(card, {
      kind: "live",
      monthLabel: "August 2026",
      generatedAt,
    });
    expect(svg).toContain(`· live, still moving · as of ${asOfLabel(generatedAt)}`);
    expect(svg).toContain("costmyai.com/intelligence<");
    expect(svg).not.toContain("costmyai.com/intelligence/");
    expect(svg).not.toContain("final, frozen figures");
    expect(svg).toContain("August 2026");
  });
});
