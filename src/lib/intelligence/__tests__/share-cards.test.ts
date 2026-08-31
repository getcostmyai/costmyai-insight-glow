import { describe, expect, it } from "vitest";

import {
  asOfLabel,
  bandCardId,
  findShareCard,
  shareCards,
  spreadCardId,
  type ShareCard,
} from "../share-cards";
import { buildShareSvg, type ShareImageCitation } from "../share-image.server";
import type { IntelligencePayload } from "../intelligence.server";

describe("asOfLabel", () => {
  it("is deterministic and UTC-stamped for a fixed ISO input", () => {
    expect(asOfLabel("2026-08-31T09:05:00.000Z")).toBe("31 Aug 2026, 09:05 UTC");
  });

  it("does not shift the date across a timezone boundary", () => {
    expect(asOfLabel("2026-08-31T23:45:00.000Z")).toBe("31 Aug 2026, 23:45 UTC");
  });
});

/**
 * Spread and band cards are the most data-volatile card types on the page: both
 * are gated on live conditions (two distinct real providers; at least one model
 * still clearing a freshly computed bar) that can differ between two requests a
 * minute apart. Until this file, only kpi-shaped cards were exercised anywhere,
 * so a formatting change on either type could ship unseen.
 */
const payload = (): IntelligencePayload =>
  ({
    generatedAt: "2026-08-31T09:05:00.000Z",
    monthLabel: "August 2026",
    monthStart: "2026-08-01",
    trackingSince: "2026-06-14T00:00:00.000Z",
    liveModels: 120,
    liveHosts: 14,
    changesTotal: 42,
    increases: 20,
    decreases: 22,
    newListings: 5,
    newModels: 3,
    multiHostModels: 9,
    topIncreases: [],
    topDecreases: [],
    repricers: [],
    spreads: [
      {
        modelKey: "llama-3.1-70b",
        displayName: "Llama 3.1 70B",
        hosts: 5,
        cheapest: 0.3,
        cheapestHost: "Together",
        dearest: 0.9,
        dearestHost: "Azure",
        spreadPct: 200,
      },
    ],
    bandWinners: [
      {
        taskClass: "Summarisation",
        suite: "MMLU",
        margin: 0.05,
        bar: 0.9,
        topScore: 0.95,
        modelKey: "gemini-flash",
        displayName: "Gemini Flash",
        score: 0.92,
        pricePerMtok: 0.15,
        hostLabel: "Google",
        qualifying: 4,
      },
    ],
    saturation: [],
    medianHostsPerModel: 2,
    maxHostsPerModel: 7,
    hostBuckets: [],
  }) as IntelligencePayload;

/**
 * `buildShareSvg` greedily wraps the detail line, so a detail longer than one
 * poster line is present as its wrapped segments rather than as one string. The
 * assertion that matters is that no word of it is silently dropped.
 */
function expectTextRendered(svg: string, text: string) {
  for (const word of text.split(/\s+/)) {
    if (!word) continue;
    expect(svg).toContain(word.replace(/&/g, "&amp;").replace(/</g, "&lt;"));
  }
}

describe("spread and band share cards", () => {
  const data = payload();
  const cards = shareCards(data);

  const spreadId = spreadCardId("llama-3.1-70b");
  const bandId = bandCardId("Summarisation");

  it("emits spread and band card ids that findShareCard resolves", () => {
    expect(cards.map((c) => c.id)).toEqual(expect.arrayContaining([spreadId, bandId]));
    expect(findShareCard(data, spreadId)).toMatchObject({ id: spreadId, tone: "up" });
    expect(findShareCard(data, bandId)).toMatchObject({ id: bandId, tone: "down" });
  });

  const citations: [string, ShareImageCitation][] = [
    ["live", { kind: "live", monthLabel: data.monthLabel, generatedAt: data.generatedAt }],
    ["frozen", { kind: "frozen", monthKey: "2026-07" }],
  ];

  for (const [kindLabel, citation] of citations) {
    for (const [typeLabel, id] of [
      ["spread", spreadId],
      ["band", bandId],
    ] as const) {
      it(`renders the ${typeLabel} card for a ${kindLabel} citation`, () => {
        const card = findShareCard(data, id) as ShareCard;
        expect(card).not.toBeNull();

        let svg = "";
        expect(() => {
          svg = buildShareSvg(card, citation);
        }).not.toThrow();

        expect(svg).toContain(card.value);
        expect(svg).toContain(card.label);
        expectTextRendered(svg, card.detail);
      });
    }
  }
});
