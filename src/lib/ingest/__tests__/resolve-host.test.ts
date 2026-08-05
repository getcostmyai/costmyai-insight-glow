/**
 * Dispatch 96 — host-key resolution.
 *
 * Same principle as the model keys of Dispatch 95: resolve the common real
 * hostname forms, and refuse to guess anything else.
 */
import { describe, expect, it } from "vitest";

import { buildHostResolver } from "@/lib/ingest/resolve-host";

const HOSTS = ["openai", "azure", "together", "deepinfra", "anthropic", "groq", "api.openai.com"];

const resolve = buildHostResolver(HOSTS);

describe("host key resolution", () => {
  it("leaves a canonical host exactly as it is", () => {
    expect(resolve("openai")).toMatchObject({ key: "openai", via: "catalog" });
  });

  it("prefers an exact priced host row over any alias interpretation", () => {
    expect(resolve("api.openai.com")).toMatchObject({ key: "api.openai.com", via: "catalog" });
  });

  it("falls through to the canonical host when the exact match prices no such model", () => {
    // `api.openai.com` carries direct-vendor rows for a few models only. For
    // everything else the same traffic belongs on the priced `openai` rows.
    const priceAware = buildHostResolver(HOSTS, {
      pricedPairs: new Set(["openai/gpt-5.5|api.openai.com", "openai/gpt-4o-mini|openai"]),
    });
    expect(priceAware("api.openai.com", "openai/gpt-5.5").key).toBe("api.openai.com");
    expect(priceAware("api.openai.com", "openai/gpt-4o-mini")).toMatchObject({
      key: "openai",
      via: "alias",
    });
  });


  it("resolves a curated provider hostname through the shared provider map", () => {
    expect(resolve("api.anthropic.com")).toMatchObject({ key: "anthropic", via: "alias" });
    expect(resolve("api.groq.com")).toMatchObject({ key: "groq", via: "alias" });
  });

  it("resolves a bare vendor domain by its own labels", () => {
    expect(resolve("openai.com")).toMatchObject({ key: "openai", via: "label" });
    expect(resolve("api.together.xyz")).toMatchObject({ key: "together", via: "alias" });
  });

  it("strips scheme, port and path before matching", () => {
    expect(resolve("https://api.deepinfra.com:443/v1/chat").key).toBe("deepinfra");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(resolve("  API.Anthropic.COM ").key).toBe("anthropic");
  });

  it("uses the curated map for a hostname whose labels are ambiguous", () => {
    // openai.azure.com names two priced hosts; the curated map settles it.
    expect(resolve("openai.azure.com")).toMatchObject({ key: "azure", via: "alias" });
  });

  it("refuses to guess when a hostname could plausibly be two hosts", () => {
    expect(resolve("openai.together.example")).toMatchObject({
      key: "openai.together.example",
      via: "unresolved",
    });
  });

  it("keeps a genuinely unknown host under its own name rather than dropping it", () => {
    expect(resolve("gateway.acme-internal.example")).toMatchObject({
      key: "gateway.acme-internal.example",
      raw: "gateway.acme-internal.example",
      via: "unresolved",
    });
  });

  it("ignores a curated hostname whose provider we hold no prices for", () => {
    const narrow = buildHostResolver(["openai"]);
    expect(narrow("api.venice.ai").via).toBe("unresolved");
  });
});
