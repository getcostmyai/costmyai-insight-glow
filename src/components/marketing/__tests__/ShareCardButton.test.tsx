// @vitest-environment jsdom
/**
 * The live page used to hand every card the previous frozen month, so a card
 * showing August's still-moving number shared July's archive. This file pins
 * the actual rendered hrefs for both citation kinds, per channel.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/use-origin", () => ({ useOrigin: () => "https://www.costmyai.com" }));
vi.mock("@/lib/intelligence-telemetry.functions", () => ({
  trackIntelligenceShare: vi.fn(() => Promise.resolve()),
}));

import { ShareCardButton } from "@/components/marketing/ShareCardButton";

afterEach(() => cleanup());

const ORIGIN = "https://www.costmyai.com";

function hrefs() {
  const get = (platform: string) =>
    document.querySelector(`[data-share-platform="${platform}"]`) as HTMLElement | null;
  return {
    linkedin: get("linkedin")?.getAttribute("href") ?? "",
    x: get("x")?.getAttribute("href") ?? "",
    copy: get("copy_link")?.getAttribute("data-share-url") ?? "",
    image: get("og_image")?.getAttribute("href") ?? "",
  };
}

describe("ShareCardButton", () => {
  it("cites the permanent month page for a frozen citation", () => {
    render(
      <ShareCardButton
        cardId="kpi-moves"
        citation={{ kind: "frozen", month: "2026-07" }}
        title="42 — Price moves"
      />,
    );
    const page = `${ORIGIN}/intelligence/2026-07?ref=share&card=kpi-moves#kpi-moves`;
    const h = hrefs();
    expect(h.copy).toBe(page);
    expect(h.linkedin).toContain(encodeURIComponent(page));
    expect(h.x).toContain(encodeURIComponent(page));
    expect(h.image).toBe(`${ORIGIN}/api/public/og/intelligence/2026-07?card=kpi-moves`);
    expect(screen.getByLabelText("Copy permanent link")).toBeInTheDocument();
  });

  it("cites the live page itself for a live citation", () => {
    render(
      <ShareCardButton
        cardId="kpi-moves"
        citation={{ kind: "live", generatedAt: "2026-08-31T09:05:00.000Z" }}
        title="42 — Price moves"
      />,
    );
    const page = `${ORIGIN}/intelligence?ref=share&card=kpi-moves#kpi-moves`;
    const h = hrefs();
    expect(h.copy).toBe(page);
    expect(h.linkedin).toContain(encodeURIComponent(page));
    expect(h.x).toContain(encodeURIComponent(page));
    expect(h.image).toBe(`${ORIGIN}/api/public/og/intelligence/live?card=kpi-moves`);
    expect(screen.getByLabelText("Copy link")).toBeInTheDocument();
    // The bug: no month segment may appear anywhere in a live share.
    expect(`${h.copy} ${h.image}`).not.toMatch(/intelligence\/\d{4}-\d{2}/);
  });
});
