/**
 * Dispatch 103 item 1 — the two remaining shapes, against the REAL providers
 * that emit them natively.
 *
 * Dispatch 102 proved the OpenAI-compatible shape against a real hosted
 * endpoint. Two shapes were still only proven against fixtures:
 *
 *   - Anthropic native   `https://api.anthropic.com/v1/messages`
 *                        → `usage.input_tokens` / `usage.output_tokens`
 *   - Google native      `https://generativelanguage.googleapis.com/v1beta/...`
 *                        → `usageMetadata.promptTokenCount` / `candidatesTokenCount`
 *
 * Both run through a real container instance, with the caller's own credential
 * in the request headers exactly as a customer's would be, and both assert on
 * the counters the container read off the provider's real response — not off a
 * recorded body.
 *
 * These tests SKIP LOUDLY when the corresponding key is absent, rather than
 * degrading into the fixture they exist to replace. Provide either or both:
 *
 *   ANTHROPIC_API_KEY=sk-ant-...      (Anthropic Console; a $5 balance is plenty)
 *   GEMINI_API_KEY=AIza...            (Google AI Studio; free tier is sufficient)
 *
 * Cost of a full run: two ~20-token completions on the cheapest model of each
 * provider. Fractions of a cent.
 */
import { describe, expect, it } from "vitest";

import { loadConfig } from "../../../../packages/gateway-container/src/config";
import { handleProxy, type ProxyEvent } from "../../../../packages/gateway-container/src/proxy";
import type { QueueItem, UpstreamQueue } from "../../../../packages/gateway-container/src/queue";

const ANTHROPIC_KEY = process.env["ANTHROPIC_API_KEY"];
const GEMINI_KEY = process.env["GEMINI_API_KEY"];

if (!ANTHROPIC_KEY) {
  console.warn(
    "[dispatch-103] SKIPPING the real Anthropic-native shape proof: ANTHROPIC_API_KEY is not set. " +
      "This test is deliberately not falling back to a fixture.",
  );
}
if (!GEMINI_KEY) {
  console.warn(
    "[dispatch-103] SKIPPING the real Google-native shape proof: GEMINI_API_KEY is not set. " +
      "This test is deliberately not falling back to a fixture.",
  );
}

function harness(upstreamUrl: string) {
  const events: ProxyEvent[] = [];
  const queue = {
    enqueue(item: QueueItem) {
      for (const e of (item.body as { events: ProxyEvent[] }).events) events.push(e);
    },
  } as unknown as UpstreamQueue;
  const config = loadConfig({
    COSTMYAI_INGEST_TOKEN: "cma_live_test",
    COSTMYAI_UPSTREAM_URL: upstreamUrl,
    COSTMYAI_SPOOL_DIR: "/tmp/costmyai-d103-native",
  });
  return { events, queue, config };
}

/** The metered event, once the streamed/buffered body has been fully read. */
async function settle(events: ProxyEvent[]): Promise<ProxyEvent> {
  for (let i = 0; i < 100 && events.length === 0; i++) await new Promise((r) => setTimeout(r, 50));
  expect(events).toHaveLength(1);
  return events[0]!;
}

describe("the Anthropic native envelope, from api.anthropic.com", () => {
  it.skipIf(!ANTHROPIC_KEY)("is parsed off a real /v1/messages response", async () => {
    const { events, queue, config } = harness("https://api.anthropic.com");
    const response = await handleProxy(
      new Request("http://localhost/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // The customer's credential. Copied through, never read by us.
          "x-api-key": ANTHROPIC_KEY!,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5",
          max_tokens: 16,
          messages: [{ role: "user", content: "Reply with the single word: ok" }],
        }),
      }),
      { config, queue },
    );

    const body = (await response.json()) as {
      usage: { input_tokens: number; output_tokens: number };
      model: string;
    };
    expect(response.status).toBe(200);
    // The provider really did return the native Anthropic shape.
    expect(body.usage.input_tokens).toBeGreaterThan(0);
    expect(body.usage.output_tokens).toBeGreaterThan(0);

    const event = await settle(events);
    expect(event.parse_status).toBe("parsed");
    expect(event.host).toBe("api.anthropic.com");
    expect(event.status).toBe("ok");
    // What we metered is exactly what the provider reported.
    expect(event.input_tokens).toBe(body.usage.input_tokens);
    expect(event.output_tokens).toBe(body.usage.output_tokens);
    expect(event.model_key).toBe(body.model);
    expect(JSON.stringify(event)).not.toContain(ANTHROPIC_KEY!);
  }, 60_000);
});

describe("the Google native envelope, from generativelanguage.googleapis.com", () => {
  it.skipIf(!GEMINI_KEY)("is parsed off a real generateContent response", async () => {
    const { events, queue, config } = harness("https://generativelanguage.googleapis.com");
    const response = await handleProxy(
      new Request("http://localhost/v1beta/models/gemini-flash-latest:generateContent", {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": GEMINI_KEY! },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Reply with the single word: ok" }] }],
          generationConfig: { maxOutputTokens: 256 },
        }),
      }),
      { config, queue },
    );

    const body = (await response.json()) as {
      usageMetadata: {
        promptTokenCount: number;
        candidatesTokenCount?: number;
        thoughtsTokenCount?: number;
        totalTokenCount: number;
      };

      modelVersion: string;
    };
    expect(response.status).toBe(200);
    // usageMetadata, not usage — the shape an OpenAI-compatible gateway hides.
    expect(body.usageMetadata.promptTokenCount).toBeGreaterThan(0);

    const event = await settle(events);
    expect(event.parse_status).toBe("parsed");
    expect(event.host).toBe("generativelanguage.googleapis.com");
    expect(event.status).toBe("ok");
    expect(event.input_tokens).toBe(body.usageMetadata.promptTokenCount);
    // Billed output = the answer PLUS the reasoning Google charges for but
    // reports separately (Dispatch 109 — this assertion previously encoded the
    // under-count: a real call returned candidates=1 against thoughts=81).
    expect(event.output_tokens).toBe(
      (body.usageMetadata.candidatesTokenCount ?? 0) + (body.usageMetadata.thoughtsTokenCount ?? 0) ||
        body.usageMetadata.totalTokenCount - body.usageMetadata.promptTokenCount,
    );

    expect(JSON.stringify(event)).not.toContain(GEMINI_KEY!);
  }, 60_000);
});
