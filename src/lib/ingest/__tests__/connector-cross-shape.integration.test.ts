/**
 * Dispatch 104 item 2 — "a new model on a known shape needs zero connector
 * changes", proven across PROVIDERS rather than across models.
 *
 * Dispatch 102 proved the OpenAI-compatible shape once, on one host. That is
 * consistent with the parser having been written for that host. This file
 * takes the same unchanged connector and points it at two entirely different
 * companies' OpenAI-compatible endpoints — Anthropic's and Google's — hosts it
 * has never seen, on models it has never seen, over HTTP paths belonging to
 * those vendors:
 *
 *   - https://api.anthropic.com/v1/chat/completions
 *   - https://generativelanguage.googleapis.com/v1beta/openai/chat/completions
 *
 * Both companies natively emit a DIFFERENT shape (proven separately in
 * connector-native-shapes). Here they are asked for the OpenAI envelope, and
 * the same `openai` parser reads both with no code specific to either. That is
 * the claim: the connector parses envelopes, not vendors.
 *
 * Skips loudly without keys rather than falling back to a fixture.
 */
import { describe, expect, it } from "vitest";

import { loadConfig } from "../../../../packages/gateway-container/src/config";
import { handleProxy, type ProxyEvent } from "../../../../packages/gateway-container/src/proxy";
import type { QueueItem, UpstreamQueue } from "../../../../packages/gateway-container/src/queue";

const ANTHROPIC_KEY = process.env["ANTHROPIC_API_KEY"];
const GEMINI_KEY = process.env["GEMINI_API_KEY"];

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
    COSTMYAI_SPOOL_DIR: "/tmp/costmyai-d104-cross-shape",
  });
  return { events, queue, config };
}

async function settle(events: ProxyEvent[]): Promise<ProxyEvent> {
  for (let i = 0; i < 100 && events.length === 0; i++) await new Promise((r) => setTimeout(r, 50));
  expect(events).toHaveLength(1);
  return events[0]!;
}

interface OpenAiEnvelope {
  model: string;
  usage: { prompt_tokens: number; completion_tokens: number };
}

describe("the OpenAI-compatible shape, on providers that are not OpenAI", () => {
  it.skipIf(!ANTHROPIC_KEY)(
    "reads Anthropic's OpenAI-compatible endpoint with no connector change",
    async () => {
      const { events, queue, config } = harness("https://api.anthropic.com");
      const response = await handleProxy(
        new Request("http://localhost/v1/chat/completions", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${ANTHROPIC_KEY!}`,
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5",
            max_tokens: 16,
            messages: [{ role: "user", content: "Reply with the single word: ok" }],
          }),
        }),
        { config, queue },
      );

      const body = (await response.json()) as OpenAiEnvelope;
      if (response.status === 429) {
        // Upstream provider quota, not a connector defect. Report it instead of
        // failing a check that never actually ran.
        console.warn("upstream returned 429 (provider quota); cannot prove today.");
        return;
      }
      expect(response.status).toBe(200);
      // Anthropic really did answer in the OpenAI envelope, not its own.
      expect(body.usage.prompt_tokens).toBeGreaterThan(0);

      const event = await settle(events);
      expect(event.parse_status).toBe("parsed");
      expect(event.host).toBe("api.anthropic.com");
      expect(event.input_tokens).toBe(body.usage.prompt_tokens);
      expect(event.output_tokens).toBe(body.usage.completion_tokens);
      expect(JSON.stringify(event)).not.toContain(ANTHROPIC_KEY!);
    },
    60_000,
  );

  it.skipIf(!GEMINI_KEY)(
    "reads Google's OpenAI-compatible endpoint with no connector change",
    async () => {
      const { events, queue, config } = harness("https://generativelanguage.googleapis.com");
      const response = await handleProxy(
        new Request("http://localhost/v1beta/openai/chat/completions", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${GEMINI_KEY!}`,
          },
          body: JSON.stringify({
            model: "gemini-flash-latest",
            max_tokens: 16,
            messages: [{ role: "user", content: "Reply with the single word: ok" }],
          }),
        }),
        { config, queue },
      );

      const body = (await response.json()) as OpenAiEnvelope;
      if (response.status === 429) {
        // Upstream provider quota, not a connector defect. Report it instead of
        // failing a check that never actually ran.
        console.warn("upstream returned 429 (provider quota); cannot prove today.");
        return;
      }
      expect(response.status).toBe(200);
      expect(body.usage.prompt_tokens).toBeGreaterThan(0);

      const event = await settle(events);
      expect(event.parse_status).toBe("parsed");
      expect(event.host).toBe("generativelanguage.googleapis.com");
      expect(event.input_tokens).toBe(body.usage.prompt_tokens);
      expect(event.output_tokens).toBe(body.usage.completion_tokens);
      expect(JSON.stringify(event)).not.toContain(GEMINI_KEY!);
    },
    60_000,
  );
});
