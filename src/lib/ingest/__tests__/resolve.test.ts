/**
 * Dispatch 95 — model-key resolution.
 *
 * The incident these cover: a real push of `gpt-4o-mini` was accepted, stored,
 * and rolled up into nothing. Resolution has to fix the common case without
 * ever inventing an attribution it cannot justify.
 */
import { describe, expect, it } from "vitest";

import { buildModelResolver } from "@/lib/ingest/resolve";

const CATALOG = [
  "openai/gpt-4o-mini",
  "openai/gpt-5.5",
  "anthropic/claude-opus-4.7",
  "vendor-a/command-r",
  "vendor-b/command-r",
];

const ALIASES = [
  { alias: "claude-opus-4-7", model_key: "anthropic/claude-opus-4.7" },
  { alias: "openai/gpt-4o-mini", model_key: "openai/gpt-4o-mini" },
  { alias: "ghost-model", model_key: "retired/never-existed" },
];

const resolve = buildModelResolver(CATALOG, ALIASES);

describe("model key resolution", () => {
  it("leaves a canonical catalog key exactly as it is", () => {
    expect(resolve("openai/gpt-4o-mini")).toMatchObject({ key: "openai/gpt-4o-mini", via: "catalog" });
  });

  it("resolves a provider-native name through the alias table", () => {
    expect(resolve("claude-opus-4-7")).toMatchObject({
      key: "anthropic/claude-opus-4.7",
      via: "alias",
    });
  });

  it("resolves the incident key by its unambiguous vendor suffix", () => {
    // The exact string that was accepted and then vanished.
    expect(resolve("gpt-4o-mini")).toMatchObject({ key: "openai/gpt-4o-mini", via: "suffix" });
  });

  it("is case- and whitespace-insensitive", () => {
    expect(resolve("  GPT-4o-Mini ").key).toBe("openai/gpt-4o-mini");
  });

  it("sees through provider variant decorations", () => {
    expect(resolve("gpt-4o-mini:free").key).toBe("openai/gpt-4o-mini");
  });

  it("refuses to guess when two vendors claim the same suffix", () => {
    expect(resolve("command-r")).toMatchObject({ key: "command-r", via: "unresolved" });
  });

  it("ignores an alias pointing at a model we no longer carry", () => {
    expect(resolve("ghost-model").via).toBe("unresolved");
  });

  it("keeps a genuinely unknown key under its own name rather than dropping it", () => {
    expect(resolve("acme/frobnicator-9")).toMatchObject({
      key: "acme/frobnicator-9",
      raw: "acme/frobnicator-9",
      via: "unresolved",
    });
  });

  it("does not strip a vendor prefix off an unknown vendor-qualified key", () => {
    // `unknownvendor/gpt-4o-mini` is a claim about a vendor we do not price;
    // silently rebadging it as OpenAI's would be a fabricated attribution.
    expect(resolve("unknownvendor/gpt-4o-mini").via).toBe("unresolved");
  });
});
