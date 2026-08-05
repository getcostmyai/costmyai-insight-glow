/**
 * Dispatch 104 — the enumeration's two findings, as tests.
 *
 * 1. Every host in the live catalog has a shape verdict, and every verdict
 *    names a parser that really exists.
 * 2. The two envelopes the enumeration found that the original five parsers
 *    could NOT read are now read correctly.
 */
import { describe, expect, it } from "vitest";

import {
  assumedHosts,
  KNOWN_SHAPES,
  PROVIDER_SHAPES,
  shapeForHost,
} from "@/lib/ingest/provider-shapes";

import { readUsage } from "../../../../packages/gateway-container/src/parse";

describe("the provider → shape table", () => {
  it("names a real parser for every provider, with no duplicates", () => {
    const hosts = PROVIDER_SHAPES.map((p) => p.host);
    expect(new Set(hosts).size).toBe(hosts.length);
    for (const p of PROVIDER_SHAPES) {
      expect(KNOWN_SHAPES).toContain(p.shape);
    }
  });

  it("covers the full catalog of tracked providers", () => {
    // The live catalog carried 71 distinct hosts when this was enumerated.
    // A new one arriving is not a test failure — it is what the pricing-feed
    // watch reports — but the table must never shrink below what was mapped.
    expect(PROVIDER_SHAPES.length).toBeGreaterThanOrEqual(71);
  });

  it("is honest about which rows rest on an assumption", () => {
    // The claim is not "all 71 verified". It is "all 71 mapped, and the ones
    // that are guesses say so". If this ever reaches zero silently, someone
    // has upgraded confidence without doing the reading.
    expect(assumedHosts().length).toBeGreaterThan(0);
    expect(shapeForHost("anthropic")?.confidence).toBe("verified");
    expect(shapeForHost("google-ai-studio")?.confidence).toBe("verified");
  });

  it("returns null for a provider nobody has looked at", () => {
    expect(shapeForHost("some-provider-that-launched-today")).toBeNull();
  });
});

describe("the sixth shape, found by the enumeration", () => {
  it("reads Tencent Hunyuan's PascalCase counters", () => {
    const reading = readUsage({
      Response: {
        Model: "hunyuan-turbos-latest",
        Usage: { PromptTokens: 41, CompletionTokens: 7, TotalTokens: 48 },
        Choices: [{ Message: { Role: "assistant", Content: "ok" } }],
      },
    });
    expect(reading.shape).toBe("tencent");
    expect(reading.parseStatus).toBe("parsed");
    expect(reading.inputTokens).toBe(41);
    expect(reading.outputTokens).toBe(7);
    expect(reading.model).toBe("hunyuan-turbos-latest");
  });

  it("reads Cloudflare Workers AI through its result wrapper", () => {
    const reading = readUsage({
      success: true,
      errors: [],
      result: {
        response: "ok",
        usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 },
      },
    });
    // Unwrapped and reported as the shape it is, not as a heuristic guess.
    expect(reading.shape).toBe("openai");
    expect(reading.parseStatus).toBe("parsed");
    expect(reading.inputTokens).toBe(12);
    expect(reading.outputTokens).toBe(3);
  });

  it("still refuses an envelope with no counters anywhere", () => {
    const reading = readUsage({ id: "x", output: [{ text: "ok" }] });
    expect(reading.parseStatus).toBe("unparsed");
    expect(reading.inputTokens).toBe(0);
  });
});
