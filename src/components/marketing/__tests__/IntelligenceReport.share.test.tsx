// @vitest-environment jsdom
/**
 * Six independent ShareCardButton call sites each passed the citation
 * separately, and the bug was that all six passed the *frozen* month even on
 * the live page. Testing one card proves nothing about the other five, so this
 * renders the whole report twice — once with a live ctx, once with a frozen one
 * — and asserts every card type's real share href.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/use-origin", () => ({ useOrigin: () => "https://www.costmyai.com" }));
vi.mock("@/lib/intelligence-telemetry.functions", () => ({
  trackIntelligenceShare: vi.fn(() => Promise.resolve()),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: Record<string, unknown> & { children?: React.ReactNode }) => (
    <a href={String(to ?? "#")} {...(rest as object)}>
      {children}
    </a>
  ),
}));

import { IntelligenceReport, type ReportContext } from "@/components/marketing/IntelligenceReport";
import type { IntelligencePayload } from "@/lib/intelligence/intelligence.server";
import {
  bandCardId,
  moveCardId,
  repricerCardId,
  spreadCardId,
} from "@/lib/intelligence/share-cards";

const GENERATED_AT = "2026-08-31T09:05:00.000Z";

beforeAll(() => {
  // Reveal/CountUp observe visibility; jsdom has no IntersectionObserver.
  class IO {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IO;
  // PriceDriftRibbon reads a motion preference; jsdom ships no matchMedia.
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => cleanup());

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
    topDecreases: [
      {
        modelKey: "deepseek-v3",
        host: "deepseek",
        hostLabel: "DeepSeek",
        pct: -30,
        inputPrev: 0.27,
        inputNow: 0.19,
        outputPrev: 1.1,
        outputNow: 0.77,
        inputPct: -29.6,
        outputPct: -30,
        observedAt: "2026-08-12T00:00:00.000Z",
      },
    ],
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
    bandWinners: [
      {
        taskClass: "general",
        displayName: "Gemini Flash",
        pricePerMtok: 0.1,
        score: 0.82,
        suite: "AA",
        bar: 0.8,
        topScore: 0.85,
        margin: 0.05,
      },
    ],
    saturation: [],
    hostBuckets: [],
  }) as unknown as IntelligencePayload;

// One id per distinct call site in the report body. (kpi-models/providers/moves
// live in HeroFigures, which the routes render inside their own hero.)
const CARD_IDS = [
  "kpi-increases",
  "kpi-multi-host",
  moveCardId("increase", "gpt-4o", "openai"),
  moveCardId("decrease", "deepseek-v3", "deepseek"),
  repricerCardId("openai"),
  spreadCardId("llama-3.1-70b"),
  bandCardId("general"),
];

function shareHrefs(): string[] {
  return Array.from(document.querySelectorAll("[data-share-platform]")).flatMap((el) => {
    const v = el.getAttribute("href") ?? el.getAttribute("data-share-url");
    return v ? [v] : [];
  });
}

describe("IntelligenceReport per-card shares", () => {
  it("cites the live page on every card type when the ctx is live", () => {
    const ctx: ReportContext = {
      frozenMonth: null,
      citableMonth: "2026-07",
      archive: [{ month: "2026-07", frozenAt: "2026-08-01T00:00:00.000Z" }],
      shareCitation: { kind: "live", generatedAt: GENERATED_AT },
    };
    render(<IntelligenceReport data={payload()} ctx={ctx} hero={null} />);

    for (const id of CARD_IDS) {
      const copy = document.querySelector(
        `[data-share-url="https://www.costmyai.com/intelligence?ref=share&card=${id}#${id}"]`,
      );
      expect(copy, `live copy-link for ${id}`).toBeTruthy();
      const image = document.querySelector(
        `a[href="https://www.costmyai.com/api/public/og/intelligence/live?card=${encodeURIComponent(id)}"]`,
      );
      expect(image, `live share image for ${id}`).toBeTruthy();
    }

    // The regression itself: no per-card share may point at an archived month.
    // The CiteAndReuse permalink is intentionally exempt and is not a share
    // control, so it carries no data-share-platform attribute.
    for (const href of shareHrefs()) {
      expect(decodeURIComponent(href)).not.toMatch(/intelligence\/2026-07/);
    }
  });

  it("cites the frozen month on every card type when the ctx is frozen", () => {
    const ctx: ReportContext = {
      frozenMonth: "2026-07",
      citableMonth: "2026-07",
      archive: [{ month: "2026-07", frozenAt: "2026-08-01T00:00:00.000Z" }],
      shareCitation: { kind: "frozen", month: "2026-07" },
    };
    render(<IntelligenceReport data={payload()} ctx={ctx} hero={null} />);

    for (const id of CARD_IDS) {
      const copy = document.querySelector(
        `[data-share-url="https://www.costmyai.com/intelligence/2026-07?ref=share&card=${id}#${id}"]`,
      );
      expect(copy, `frozen copy-link for ${id}`).toBeTruthy();
      const image = document.querySelector(
        `a[href="https://www.costmyai.com/api/public/og/intelligence/2026-07?card=${encodeURIComponent(id)}"]`,
      );
      expect(image, `frozen share image for ${id}`).toBeTruthy();
    }
  });
});
