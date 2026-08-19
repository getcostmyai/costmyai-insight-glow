import { describe, expect, it } from "vitest";

import { classifyContent, extractSignalText } from "../classify-local.js";
import { classifyRequest } from "../classify.js";
import { TASK_HINTS } from "../config.js";

const body = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value));

const chat = (content: string, extra: Record<string, unknown> = {}): Uint8Array =>
  body({ model: "gpt-4o", messages: [{ role: "user", content }], ...extra });

describe("local classification: the label it derives", () => {
  it("reads code from a fenced block and a debugging ask", () => {
    const decision = classifyContent(
      chat("This throws a TypeError, can you fix it?\n```ts\nfunction total(items) { return items.reduce((a,b) => a+b) }\n```"),
    );
    expect(decision.hint).toBe("code");
    expect(decision.source).toBe("content");
    expect(decision.confidence).toBeGreaterThan(0.5);
  });

  it("reads reasoning from a multiple-choice question asked step by step", () => {
    const decision = classifyContent(
      chat("Work step by step. Which of the following best explains why the yield curve inverted?\n(A) policy\n(B) demand\n(C) supply"),
    );
    expect(decision.hint).toBe("reasoning");
  });

  it("reads agentic from a declared tool schema plus an execution instruction", () => {
    const decision = classifyContent(
      chat("Use the following tools to book the table, then confirm.", {
        tools: [{ type: "function", function: { name: "book_table" } }],
      }),
    );
    expect(decision.hint).toBe("agentic");
  });

  it("reads generation from a drafting instruction", () => {
    const decision = classifyContent(chat("Draft a launch announcement email for our new pricing page."));
    expect(decision.hint).toBe("generation");
  });

  it("reads classification from a closed-set label ask", () => {
    const decision = classifyContent(chat("Classify the sentiment of this review. Respond with one word.\n'shipping took a week'"));
    expect(decision.hint).toBe("classification");
  });

  it("only ever returns a label the wire taxonomy accepts", () => {
    const samples = [
      "```py\nprint(1)\n```",
      "Summarize this thread.",
      "Prove that the sum of two odd numbers is even.",
      "hello",
      "Classify: spam or not spam?",
    ];
    for (const sample of samples) {
      expect(TASK_HINTS).toContain(classifyContent(chat(sample)).hint);
    }
  });
});

describe("structural certainties beat wording", () => {
  it("calls a conversation carrying a tool result agentic on wire shape alone", () => {
    const decision = classifyContent(
      body({
        model: "claude-sonnet-4.5",
        messages: [
          { role: "user", content: "write me a poem" },
          { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "search" }] },
          { role: "user", content: [{ type: "tool_result", tool_use_id: "t1" }] },
        ],
      }),
    );
    expect(decision.hint).toBe("agentic");
    expect(decision.source).toBe("structure");
    expect(decision.confidence).toBeGreaterThan(0.9);
  });

  it("calls a schema-constrained 8-token request classification", () => {
    const decision = classifyContent(
      chat("Which bucket does this belong in?", {
        response_format: { type: "json_schema", json_schema: { name: "bucket" } },
        max_tokens: 8,
      }),
    );
    expect(decision.hint).toBe("classification");
    expect(decision.source).toBe("structure");
  });

  it("does not let a schema alone imply a label when the output is long-form", () => {
    const decision = classifyContent(
      chat("Tell me about the history of the Danube.", {
        response_format: { type: "json_schema", json_schema: { name: "essay" } },
        max_tokens: 4000,
      }),
    );
    expect(decision.hint).toBe("unknown");
  });
});

describe("it abstains rather than guesses", () => {
  it("abstains on ordinary open-ended chat", () => {
    const decision = classifyContent(chat("hey, what do you think about the meeting yesterday?"));
    expect(decision.hint).toBe("unknown");
    expect(decision.abstained).toBe("weak_signal");
  });

  it("abstains when two different instruments are equally plausible", () => {
    // "explain why" (reasoning) against a fenced code block (code): one weight
    // each way, and the two certify through different instruments.
    const decision = classifyContent(chat("Explain why this happens:\n```\nfoo\n```"));
    expect(decision.hint).toBe("unknown");
    expect(decision.abstained).toBe("ambiguous");
  });

  it("does NOT abstain when the tie is between two labels that certify identically", () => {
    // generation vs classification both resolve to the LCR instrument, so the
    // verdict is the same either way and refusing would cost a real answer.
    const decision = classifyContent(chat("Summarize this ticket and extract the fields as JSON."));
    expect(["generation", "classification"]).toContain(decision.hint);
    expect(decision.abstained).toBeUndefined();
  });

  it("abstains on a body it cannot read", () => {
    expect(classifyContent(new TextEncoder().encode("not json at all")).abstained).toBe("unreadable");
    expect(classifyContent(undefined).abstained).toBe("unreadable");
  });

  it("abstains on a known shape carrying no usable text", () => {
    expect(classifyContent(body({ model: "gpt-4o", messages: [{ role: "user", content: "ok" }] })).abstained).toBe("no_content");
  });

  it("abstains on a shape it does not recognise rather than reaching into it", () => {
    expect(classifyContent(body({ payload: { weird: "Classify the sentiment of this" } })).abstained).toBe("no_content");
  });
});

describe("the privacy boundary", () => {
  const secret = "ACME Q3 revenue was 4.2 million and the CEO is resigning on Tuesday";

  it("returns no fragment of the text it read", () => {
    const decision = classifyContent(chat(`Summarize this for the board: ${secret}`));
    const serialized = JSON.stringify(decision);
    expect(serialized).not.toContain("ACME");
    expect(serialized).not.toContain("resigning");
    expect(serialized).not.toContain("4.2");
    // What it does return: a label, a number, and feature names.
    expect(decision.signals.every((s) => /^[a-z_]+\.[a-z_]+$/.test(s))).toBe(true);
  });

  it("never reads content at all unless the customer turned it on", () => {
    const off = classifyRequest({ path: "/v1/chat/completions", model: "gpt-4o", body: chat(`Fix this bug:\n\`\`\`ts\nlet x\n\`\`\``), readContent: false });
    expect(off.hint).toBe("unknown");
    expect(off.source).toBe("abstained");
    expect(off.signals).toEqual([]);

    const on = classifyRequest({ path: "/v1/chat/completions", model: "gpt-4o", body: chat(`Fix this bug:\n\`\`\`ts\nlet x\n\`\`\``), readContent: true });
    expect(on.hint).toBe("code");
  });

  it("keeps structural tells ahead of content, so an embeddings call is never re-read into something else", () => {
    const decision = classifyRequest({
      path: "/v1/embeddings",
      model: "text-embedding-3-small",
      body: chat("Draft a blog post about our launch"),
      readContent: true,
    });
    expect(decision.hint).toBe("classification");
    expect(decision.source).toBe("path");
  });
});

describe("dialects this container actually sees", () => {
  it("reads Anthropic messages with a system string", () => {
    const decision = classifyContent(
      body({
        model: "claude-sonnet-4.5",
        system: "You are a senior engineer. Refactor the function you are given.",
        messages: [{ role: "user", content: [{ type: "text", text: "```py\ndef f(): pass\n```" }] }],
      }),
    );
    expect(decision.hint).toBe("code");
  });

  it("reads Google generateContent parts", () => {
    const decision = classifyContent(
      body({
        contents: [{ role: "user", parts: [{ text: "Translate the following paragraph into German and shorten it." }] }],
      }),
    );
    expect(decision.hint).toBe("generation");
  });

  it("reads a plain completions prompt", () => {
    expect(classifyContent(body({ model: "gpt-3.5-turbo-instruct", prompt: "Classify this ticket as bug or feature. Respond with one word." })).hint).toBe(
      "classification",
    );
  });

  it("walks only a bounded window of a very long conversation", () => {
    const messages = Array.from({ length: 400 }, (_, i) => ({ role: "user", content: `turn ${i}` }));
    const extracted = extractSignalText(body({ model: "gpt-4o", messages }));
    expect(extracted?.turns).toBe(400);
    expect(extracted?.text.length).toBeLessThanOrEqual(4_000);
  });
});

describe("cost of running it on every request", () => {
  it("classifies a realistic body in well under a millisecond", () => {
    const sample = body({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a helpful assistant for a logistics company." },
        { role: "user", content: `Fix this:\n\`\`\`ts\n${"const line = 1;\n".repeat(60)}\`\`\`` },
      ],
    });
    // Warm-up, then measure — a cold first call is JIT, not the steady state
    // that would sit on a customer's hot path.
    for (let i = 0; i < 500; i++) classifyContent(sample);
    const started = performance.now();
    const runs = 5_000;
    for (let i = 0; i < runs; i++) classifyContent(sample);
    const perCall = (performance.now() - started) / runs;
    // eslint-disable-next-line no-console
    console.log(`classifyContent: ${(perCall * 1000).toFixed(1)}µs per call`);
    expect(perCall).toBeLessThan(1);
  });
});
