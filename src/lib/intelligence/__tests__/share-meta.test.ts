import { describe, expect, it } from "vitest";

import { buildIndexHead } from "@/routes/intelligence.index";
import { buildMonthHead } from "@/routes/intelligence.$month";
import type { IntelligencePayload } from "@/lib/intelligence/intelligence.server";
import type { FrozenMonth } from "@/lib/intelligence/snapshot.server";
import { moveCardId, spreadCardId } from "@/lib/intelligence/share-cards";

/**
 * A share link already carried `?card=<id>`; the head() functions ignored it, so
 * every LinkedIn preview said the same generic thing. These assert the opposite
 * per card type, and that a plain visit is byte-for-byte what it was.
 */
const GENERATED_AT = "2026-08-31T09:05:00.000Z";

const payload = (): IntelligencePayload =>
  ({
    generatedAt: GENERATED_AT,
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
    topIncreases: [
      {
        modelKey: "gpt-4o",
        host: "openai",
        hostLabel: "OpenAI",
        pct: 12.5,
        inputPrev: 2.5,
        inputNow: 2.81,
        outputPrev: 10,
        outputNow: 11.2,
        inputPct: 12.4,
        outputPct: 12,
        observedAt: "2026-08-10T00:00:00.000Z",
      },
    ],
    topDecreases: [],
    repricers: [{ host: "openai", hostLabel: "OpenAI", changes: 7, models: 4 }],
    spreads: [
      {
        modelKey: "llama-3.1-70b",
        displayName: "Llama 3.1 70B",
        cheapest: 0.3,
        dearest: 0.9,
        cheapestHost: "Together",
        dearestHost: "Azure",
        spreadPct: 200,
        hosts: 5,
      },
    ],
    bandWinners: [],
    saturation: [],
    hostBuckets: [],
    medianHostsPerModel: 2,
    maxHostsPerModel: 5,
  }) as unknown as IntelligencePayload;

const frozen = (): FrozenMonth =>
  ({
    id: "f1",
    month: "2026-07",
    frozenAt: "2026-08-01T00:00:00.000Z",
    supersedesId: null,
    note: null,
    restated: false,
    payload: payload(),
  }) as FrozenMonth;

const get = (head: { meta: Record<string, unknown>[] }, key: string, value: string) =>
  head.meta.find((m) => m[key] === value) as Record<string, string> | undefined;
const prop = (head: { meta: Record<string, unknown>[] }, p: string) =>
  (head.meta.find((m) => m.property === p) as { content?: string } | undefined)?.content;

const CARDS = ["kpi-moves", moveCardId("increase", "gpt-4o", "openai"), spreadCardId("llama-3.1-70b")];

describe("buildIndexHead", () => {
  for (const id of CARDS) {
    it(`renders card-specific meta for ${id}`, () => {
      const head = buildIndexHead(payload(), id) as {
        meta: Record<string, unknown>[];
        links: Record<string, string>[];
      };
      const title = prop(head, "og:title")!;
      expect(title).toContain("| CostMyAI Intelligence");
      expect(title).not.toContain("the live AI price and quality market");
      expect(prop(head, "og:description")).not.toContain("provider-to-provider spreads");
      expect(prop(head, "og:image")).toBe(
        `https://www.costmyai.com/api/public/og/intelligence/live?card=${encodeURIComponent(id)}`,
      );
      expect(prop(head, "og:url")).toBe(
        `https://www.costmyai.com/intelligence?card=${encodeURIComponent(id)}`,
      );
      expect(head.links).toContainEqual({
        rel: "canonical",
        href: `https://www.costmyai.com/intelligence?card=${encodeURIComponent(id)}`,
      });
      expect(get(head, "title", title)).toBeTruthy();
    });
  }

  it("keeps the generic page meta unchanged with no card param", () => {
    const head = buildIndexHead(payload(), undefined);
    expect(head).toEqual({
      meta: [
        { title: "Intelligence: live AI price and quality market data | CostMyAI" },
        {
          name: "description",
          content:
            "Live market intelligence on the AI model economy: models and providers tracked, price moves this month, multi-provider price spreads and the cheapest model clearing each measured quality band.",
        },
        { property: "og:title", content: "Intelligence: the live AI price and quality market" },
        {
          property: "og:description",
          content:
            "Price moves this month, provider-to-provider spreads on identical weights, and quality-per-dollar winners inside measured benchmark margins.",
        },
        { property: "og:type", content: "website" },
        { property: "og:url", content: "https://www.costmyai.com/intelligence" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: "https://www.costmyai.com/intelligence" }],
    });
  });

  it("falls back to generic meta for an unknown card id", () => {
    expect(buildIndexHead(payload(), "no-such-card")).toEqual(buildIndexHead(payload(), undefined));
  });
});

describe("buildMonthHead", () => {
  for (const id of CARDS) {
    it(`renders card-specific meta for ${id}`, () => {
      const head = buildMonthHead({ frozen: frozen() }, "2026-07", id) as {
        meta: Record<string, unknown>[];
        links: Record<string, string>[];
      };
      expect(prop(head, "og:title")).toContain("| CostMyAI Intelligence");
      expect(prop(head, "og:title")).not.toContain("frozen figures | CostMyAI");
      expect(prop(head, "og:image")).toBe(
        `https://www.costmyai.com/api/public/og/intelligence/2026-07?card=${encodeURIComponent(id)}`,
      );
      expect(prop(head, "og:url")).toBe(
        `https://www.costmyai.com/intelligence/2026-07?card=${encodeURIComponent(id)}`,
      );
      expect(head.links).toContainEqual({
        rel: "canonical",
        href: `https://www.costmyai.com/intelligence/2026-07?card=${encodeURIComponent(id)}`,
      });
    });
  }

  it("keeps the month-aggregate meta unchanged with no card param", () => {
    const title = "August 2026 AI price report. Frozen figures | CostMyAI";
    const description =
      "Frozen August 2026 market figures: 42 price moves (20 up, 22 down) across 120 models and 14 providers. Written once, never edited.";
    expect(buildMonthHead({ frozen: frozen() }, "2026-07", undefined)).toEqual({
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { property: "og:url", content: "https://www.costmyai.com/intelligence/2026-07" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: "https://www.costmyai.com/intelligence/2026-07" }],
    });
  });

  it("never lets a card param override a genuine not-found month", () => {
    expect(buildMonthHead({ frozen: null }, "2026-07", "kpi-moves")).toEqual({
      meta: [
        { title: "Month not archived | CostMyAI" },
        { name: "robots", content: "noindex" },
      ],
    });
  });
});
