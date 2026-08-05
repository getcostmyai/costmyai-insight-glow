/**
 * Dispatch 109 — reasoning tokens are billed output.
 *
 * Found on a real Gemini call through the published connector: the response
 * carried candidatesTokenCount=1 alongside thoughtsTokenCount=67. Reading
 * candidates alone reported 1 output token for 68 billed ones — a silent 68x
 * under-count of output cost on every thinking model, which understates spend
 * and makes reconciliation against the real invoice disagree for reasons
 * nobody could see.
 */
import { describe, expect, it } from "vitest";

import { readUsage } from "../../../../packages/gateway-container/src/parse";

describe("Gemini native: reasoning tokens", () => {
  it("counts thoughtsTokenCount as output, exactly as Google bills it", () => {
    // The real envelope observed in Dispatch 109, verbatim in shape.
    const reading = readUsage({
        candidates: [{ content: { parts: [{ text: "apple" }] } }],
        usageMetadata: {
          promptTokenCount: 7,
          candidatesTokenCount: 1,
          totalTokenCount: 75,
          thoughtsTokenCount: 67,
        },
        modelVersion: "gemini-3.6-flash",
    });
    expect(reading.parseStatus).toBe("parsed");
    expect(reading.shape).toBe("gemini");
    expect(reading.inputTokens).toBe(7);
    expect(reading.outputTokens).toBe(68); // 1 answer + 67 reasoning
  });

  it("still reads a non-thinking response unchanged", () => {
    const reading = readUsage({
        usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 30, totalTokenCount: 42 },
        modelVersion: "gemini-2.0-flash",
    });
    expect(reading.inputTokens).toBe(12);
    expect(reading.outputTokens).toBe(30);
  });
});

describe("the heuristic fallback", () => {
  it("adds reasoning tokens to output in an envelope it does not recognise", () => {
    const reading = readUsage({ some_vendor: { usage: { input_tokens: 5, output_tokens: 2, reasoning_tokens: 40 } } }),
      "vendor/model",
    );
    expect(reading.parseStatus).toBe("tokens_only");
    expect(reading.inputTokens).toBe(5);
    expect(reading.outputTokens).toBe(42);
  });
});
