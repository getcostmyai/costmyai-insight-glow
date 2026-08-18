import { describe, expect, it, beforeEach } from "vitest";

import { buildWidgetStats, __resetWidgetState } from "../widget.server";
import { callerIdentity, RATE_RULES } from "@/lib/rate-limit.server";

import { renderWidgetDocument, widgetDocumentHeaders } from "../widget-html.server";
import type { IntelligencePayload, PriceMove } from "../intelligence.server";

const move = (over: Partial<PriceMove>): PriceMove => ({
  modelKey: "acme/model-1",
  host: "acme-host",
  hostLabel: "Acme Host",
  kind: "increase",
  inputNow: 2,
  inputPrev: 1,
  inputPct: 100,
  outputNow: null,
  outputPrev: null,
  outputPct: null,
  pct: 100,
  observedAt: "2026-08-01T00:00:00Z",
  ...over,
});

const payload = (over: Partial<IntelligencePayload> = {}): IntelligencePayload =>
  ({
    generatedAt: "2026-08-01T00:00:00Z",
    monthLabel: "August 2026",
    monthStart: "2026-08-01",
    trackingSince: null,
    liveModels: 10,
    liveHosts: 5,
    changesTotal: 36,
    increases: 12,
    decreases: 24,
    newListings: 3,
    newModels: 2,
    topIncreases: [move({ pct: 120 })],
    topDecreases: [move({ kind: "decrease", pct: -60, inputPrev: 5, inputNow: 2 })],
    repricers: [],
    spreads: [],
    multiHostModels: 4,
    medianHostsPerModel: 2,
    maxHostsPerModel: 9,
    hostBuckets: [],
    bandWinners: [],
    saturation: [],
    ...over,
  }) as IntelligencePayload;

describe("widget rotation set", () => {
  beforeEach(() => __resetWidgetState());

  it("is locked to the three flashiest stats, in order", () => {
    const stats = buildWidgetStats(payload(), payload({ changesTotal: 24 }));
    expect(stats.map((s) => s.id)).toEqual(["mom-moves", "top-increase", "top-decrease"]);
    expect(stats[0].detail).toContain("+50.0%"); // 36 vs 24 last month
    expect(stats[1].tone).toBe("up");
    expect(stats[2].tone).toBe("down");
  });

  it("still renders without a previous month to compare against", () => {
    const stats = buildWidgetStats(payload(), null);
    expect(stats[0].detail).not.toContain("last month");
  });
});

describe("widget rate limit", () => {
  beforeEach(() => __resetWidgetState());

  it("no longer keeps a per-isolate counter of its own", async () => {
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/lib/intelligence/widget.server.ts", "utf8"),
    );
    expect(src).not.toMatch(/new Map<string, \{ count/);
    expect(src).not.toContain("export function rateLimit");
  });

  it("keeps an embed-specific ceiling separate from the other public endpoints", () => {
    expect(RATE_RULES.widgetDoc.name).not.toBe(RATE_RULES.estimator.name);
    expect(RATE_RULES.widgetDoc.limit).toBe(60);
  });

  it("keys callers by client ip, falling back to origin", () => {
    const a = callerIdentity(
      new Request("https://x.test", { headers: { "x-forwarded-for": "1.1.1.1" } }),
    );
    const b = callerIdentity(new Request("https://x.test", { headers: { origin: "https://b.test" } }));
    expect(a).toBe("1.1.1.1");
    expect(b).toBe("b.test");
  });
});


describe("widget document safety", () => {
  it("escapes hostile stat text instead of emitting markup", () => {
    const html = renderWidgetDocument(
      {
        month: "August 2026",
        generatedAt: "2026-08-01T00:00:00Z",
        computedAt: 0,
        stats: [
          {
            id: "mom-moves",
            value: "36",
            label: "</script><img src=x onerror=alert(1)>",
            detail: "ok",
            tone: "brand",
          },
        ],
      },
      { origin: "https://costmyai.test", nonce: "abc" },
    );
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("\\u003c/script>");
    expect(html).toContain("Powered by <b>Cost<i>My</i>AI</b>"); // attribution is not optional
  });

  it("allows framing anywhere but nothing else", () => {
    const csp = String((widgetDocumentHeaders("abc") as Record<string, string>)["Content-Security-Policy"]);
    expect(csp).toContain("frame-ancestors *");
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("script-src 'nonce-abc'");
    expect(csp).not.toContain("unsafe-inline");
  });
});
