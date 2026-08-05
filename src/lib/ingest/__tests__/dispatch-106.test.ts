import { describe, expect, it } from "vitest";

import { readUsage } from "../../../../packages/gateway-container/src/parse";
import {
  envelopeSkeleton,
  isContentFree,
  SKELETON_LIMITS,
} from "../../../../packages/gateway-container/src/skeleton";
import { correctionFor, type DegradedEvent } from "../reprocess.server";
import { ingestEventSchema } from "../schema";
import { rollupEvents, type SyntheticEvent } from "@/lib/synthetic/generator";
import type { PriceRow } from "@/lib/engine/types";

/**
 * Dispatch 106 — retroactive reprocessing.
 *
 * The scope check first: reprocessing is impossible without retention, and the
 * charter forbids retaining a response body. These tests prove the compromise
 * actually holds on both sides — the retained skeleton carries no content, and
 * it carries enough structure for a parser shipped later to re-read the event.
 */

const price: PriceRow = {
  model_key: "test-model",
  host: "test-host",
  host_label: "Test",
  input_usd_per_mtok: 3,
  output_usd_per_mtok: 15,
} as PriceRow;

function bucketCost(inputTokens: number, outputTokens: number): number {
  const event: SyntheticEvent = {
    occurredAt: new Date("2026-07-14T10:20:00Z"),
    modelKey: "test-model",
    host: "test-host",
    taskHint: "unknown",
    inputTokens,
    outputTokens,
    latencyMs: 400,
    status: "ok",
  };
  const buckets = rollupEvents([event], "hour", () => price);
  return buckets[0]!.costUsd;
}

describe("envelope skeleton — the retention prerequisite", () => {
  const cloudflare = {
    success: true,
    errors: [],
    messages: [],
    result: {
      response: "The customer's completion text, which must never survive this.",
      usage: { prompt_tokens: 91, completion_tokens: 27, total_tokens: 118 },
    },
  };

  it("keeps every number and destroys every string", () => {
    const skeleton = envelopeSkeleton(cloudflare) as Record<string, unknown>;
    const result = skeleton["result"] as Record<string, unknown>;

    expect(result["usage"]).toEqual({ prompt_tokens: 91, completion_tokens: 27, total_tokens: 118 });
    expect(result["response"]).toBeNull();
    expect(JSON.stringify(skeleton)).not.toContain("customer");
    expect(isContentFree(skeleton)).toBe(true);
  });

  it("erases strings anywhere, at any depth, without inspecting them", () => {
    const nested = envelopeSkeleton({
      a: { b: { c: [{ text: "secret" }, "secret", 5] } },
      model: "gpt-4o-mini",
    });
    expect(JSON.stringify(nested)).not.toContain("secret");
    expect(JSON.stringify(nested)).not.toContain("gpt-4o-mini");
    expect(isContentFree(nested)).toBe(true);
  });

  it("is bounded, so a pathological envelope cannot cost a row", () => {
    const deep: Record<string, unknown> = {};
    let cursor = deep;
    for (let i = 0; i < 40; i++) {
      const next: Record<string, unknown> = {};
      cursor["next"] = next;
      cursor = next;
    }
    const skeleton = envelopeSkeleton(deep);
    expect(JSON.stringify(skeleton).length).toBeLessThanOrEqual(SKELETON_LIMITS.maxSerializedBytes);

    const wide = { blob: "x".repeat(200_000), rows: Array.from({ length: 5_000 }, (_, i) => i) };
    expect(JSON.stringify(envelopeSkeleton(wide) ?? "").length).toBeLessThanOrEqual(
      SKELETON_LIMITS.maxSerializedBytes,
    );
  });

  it("is only ever produced for a read that was not clean", () => {
    const clean = readUsage({ model: "gpt-4o", usage: { prompt_tokens: 10, completion_tokens: 2 } });
    expect(clean.parseStatus).toBe("parsed");
    expect(clean.skeleton).toBeUndefined();

    const degraded = readUsage({ id: "resp_1", output: [{ text: "..." }] });
    expect(degraded.parseStatus).toBe("unparsed");
    expect(degraded.skeleton).not.toBeNull();
  });

  it("is refused at the ingest edge if a container tries to post content in it", () => {
    const base = {
      model_key: "m",
      host: "h",
      input_tokens: 1,
      output_tokens: 1,
      parse_status: "unparsed" as const,
    };
    expect(
      ingestEventSchema.safeParse({ ...base, envelope_skeleton: { usage: { prompt_tokens: 4 } } })
        .success,
    ).toBe(true);
    expect(
      ingestEventSchema.safeParse({
        ...base,
        envelope_skeleton: { choices: [{ message: { content: "a prompt smuggled in" } }] },
      }).success,
    ).toBe(false);
  });
});

describe("reprocessing a real Stage 5 finding", () => {
  /**
   * Cloudflare Workers AI, exactly as it was before Dispatch 104 taught the
   * parser to unwrap `result`. The heuristic scan did find the counters, so
   * the numbers were right and the CONFIDENCE was wrong — recorded honestly as
   * `tokens_only`. Reprocessing settles that: same numbers, now attributable
   * to a real parser rather than to a guess.
   */
  const cloudflareEvent: DegradedEvent = {
    id: 1,
    org_id: "org-1",
    occurred_at: "2026-07-14T10:20:00Z",
    status: "ok",
    parse_status: "tokens_only",
    input_tokens: 91,
    output_tokens: 27,
    envelope_skeleton: envelopeSkeleton({
      success: true,
      result: {
        response: "…",
        usage: { prompt_tokens: 91, completion_tokens: 27, total_tokens: 118 },
      },
    }),
  };

  it("upgrades tokens_only to parsed with the real counts", () => {
    const correction = correctionFor(cloudflareEvent)!;
    expect(correction.parseStatus).toBe("parsed");
    expect(correction.inputTokens).toBe(91);
    expect(correction.outputTokens).toBe(27);
    expect(correction.tokensChanged).toBe(false);
  });

  /**
   * Tencent's TC3 envelope is the case where the numbers were wrong too: no
   * parser and no known counter name, so it metered as zero and looked, from
   * the dashboard, exactly like traffic that never happened.
   */
  const tencentEvent: DegradedEvent = {
    id: 2,
    org_id: "org-1",
    occurred_at: "2026-07-14T10:20:00Z",
    status: "ok",
    parse_status: "unparsed",
    input_tokens: 0,
    output_tokens: 0,
    envelope_skeleton: envelopeSkeleton({
      Response: {
        RequestId: "b0d1-…",
        Usage: { PromptTokens: 812, CompletionTokens: 214, TotalTokens: 1026 },
      },
    }),
  };

  it("recovers counts that were metered as zero, and the rollup follows", () => {
    const correction = correctionFor(tencentEvent)!;
    expect(correction.parseStatus).toBe("parsed");
    expect(correction.inputTokens).toBe(812);
    expect(correction.outputTokens).toBe(214);
    expect(correction.tokensChanged).toBe(true);

    // The rollup is re-derived from the corrected event by the same
    // `rollupEvents` ingest uses — the hour moves from "no spend" to real spend.
    expect(bucketCost(tencentEvent.input_tokens, tencentEvent.output_tokens)).toBe(0);
    const corrected = bucketCost(correction.inputTokens, correction.outputTokens);
    expect(corrected).toBeCloseTo((812 / 1e6) * 3 + (214 / 1e6) * 15, 10);
    expect(corrected).toBeGreaterThan(0);
  });

  it("never downgrades, and never touches an event a newer parser cannot improve", () => {
    expect(correctionFor({ ...cloudflareEvent, parse_status: "parsed" })).toBeNull();
    expect(correctionFor({ ...tencentEvent, envelope_skeleton: null })).toBeNull();
    expect(
      correctionFor({ ...tencentEvent, envelope_skeleton: envelopeSkeleton({ id: 1, choices: [] }) }),
    ).toBeNull();
  });

  it("keeps the error-event rule: a failed call is never credited output tokens", () => {
    const correction = correctionFor({ ...tencentEvent, status: "error" })!;
    expect(correction.inputTokens).toBe(812);
    expect(correction.outputTokens).toBe(0);
  });
});
