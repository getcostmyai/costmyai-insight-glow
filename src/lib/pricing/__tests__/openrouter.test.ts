import { describe, expect, it } from "vitest";

import {
  diffPrice,
  displayNameOf,
  hostSlug,
  isReasoning,
  isTextModel,
  perMtok,
  SOURCE_PRIORITY,
  tierFor,
  transformCatalog,
  transformEndpoints,
  vendorOf,
  type OrModel,
  type PriceEntry,
} from "../openrouter";

function model(over: Partial<OrModel> = {}): OrModel {
  return {
    id: "openai/gpt-4o",
    name: "OpenAI: GPT-4o",
    context_length: 128000,
    architecture: { modality: "text->text", input_modalities: ["text"], output_modalities: ["text"] },
    pricing: { prompt: "0.0000025", completion: "0.00001" },
    supported_parameters: ["max_tokens"],
    ...over,
  };
}

describe("price normalisation", () => {
  it("converts per-token to per-Mtok", () => {
    expect(perMtok("0.0000025")).toBe(2.5);
    expect(perMtok("0.00000014")).toBe(0.14);
    expect(perMtok(0)).toBe(0);
  });

  it("refuses unusable values rather than guessing", () => {
    expect(perMtok(null)).toBeNull();
    expect(perMtok("")).toBeNull();
    expect(perMtok("not-a-price")).toBeNull();
    expect(perMtok("-1")).toBeNull();
  });
});

describe("normalisation helpers", () => {
  it("derives the vendor from the id namespace", () => {
    expect(vendorOf("deepseek/deepseek-v4")).toBe("deepseek");
    expect(vendorOf("Anthropic/Claude")).toBe("anthropic");
    expect(vendorOf("bare-key")).toBe("bare-key");
  });

  it("strips the vendor prefix from the display name", () => {
    expect(displayNameOf(model())).toBe("GPT-4o");
    expect(displayNameOf(model({ name: "Plain Name" }))).toBe("Plain Name");
  });

  it("bands the tier by blended price", () => {
    expect(tierFor(0.14, 0.28)).toBe("economy");
    expect(tierFor(2.5, 10)).toBe("standard");
    expect(tierFor(15, 75)).toBe("frontier");
  });

  it("detects reasoning support from published parameters", () => {
    expect(isReasoning(model())).toBe(false);
    expect(isReasoning(model({ supported_parameters: ["reasoning"] }))).toBe(true);
  });

  it("accepts text->text only", () => {
    expect(isTextModel(model())).toBe(true);
    expect(
      isTextModel(
        model({
          architecture: { modality: "text->image", input_modalities: ["text"], output_modalities: ["image"] },
        }),
      ),
    ).toBe(false);
    expect(isTextModel(model({ architecture: null }))).toBe(false);
  });

  it("slugs provider names", () => {
    expect(hostSlug("DeepInfra")).toBe("deepinfra");
    expect(hostSlug("Together AI")).toBe("together-ai");
  });
});

describe("transformCatalog", () => {
  it("imports every usable model rather than intersecting a known set", () => {
    const { entries } = transformCatalog([
      model(),
      model({ id: "anthropic/claude-4", name: "Anthropic: Claude 4" }),
      model({ id: "meta/llama-4", name: "Meta: Llama 4" }),
    ]);
    expect(entries.map((e) => e.model_key)).toEqual([
      "openai/gpt-4o",
      "anthropic/claude-4",
      "meta/llama-4",
    ]);
  });

  it("rejects rather than guesses", () => {
    const { entries, skipped } = transformCatalog([
      model({ id: "a/no-price", pricing: { prompt: null, completion: null } }),
      model({ id: "a/free", pricing: { prompt: "0", completion: "0" } }),
      model({
        id: "a/vision",
        architecture: { modality: "text->image", input_modalities: ["text"], output_modalities: ["image"] },
      }),
      model({ id: "" as string }),
    ]);
    expect(entries).toHaveLength(0);
    expect(skipped.map((s) => s.reason)).toEqual([
      "no published price",
      "zero price (free tier)",
      "not a text->text model",
      "no id",
    ]);
  });

  it("drops duplicate ids in the feed", () => {
    const { entries, skipped } = transformCatalog([model(), model()]);
    expect(entries).toHaveLength(1);
    expect(skipped[0].reason).toBe("duplicate id in feed");
  });
});

describe("transformEndpoints", () => {
  it("keeps the cheapest endpoint per provider", () => {
    const { prices } = transformEndpoints("deepseek/v4", [
      { provider_name: "DeepInfra", pricing: { prompt: "0.0000002", completion: "0.0000004" } },
      { provider_name: "DeepInfra", pricing: { prompt: "0.00000009", completion: "0.00000018" } },
      { provider_name: "Groq", pricing: { prompt: "0.0000003", completion: "0.0000006" } },
    ]);
    expect(prices).toHaveLength(2);
    const deepinfra = prices.find((p) => p.host === "deepinfra")!;
    expect(deepinfra.input_usd_per_mtok).toBe(0.09);
    expect(deepinfra.source_priority).toBe(SOURCE_PRIORITY.openrouter);
  });

  it("skips endpoints without a usable price", () => {
    const { prices, skipped } = transformEndpoints("m", [
      { provider_name: "Ghost", pricing: { prompt: null, completion: null } },
      { provider_name: "", pricing: { prompt: "0.000001", completion: "0.000002" } },
    ]);
    expect(prices).toHaveLength(0);
    expect(skipped).toHaveLength(2);
  });
});

describe("diffPrice", () => {
  const next: PriceEntry = {
    model_key: "m",
    host: "h",
    host_label: "H",
    region: "global",
    input_usd_per_mtok: 2,
    output_usd_per_mtok: 8,
    price_source: "openrouter",
    source_priority: 50,
    external_id: "m|h",
  };

  it("records a first sighting as new", () => {
    expect(diffPrice(next, undefined)?.change_kind).toBe("new");
  });

  it("writes NOTHING when a re-verified price has not moved", () => {
    expect(diffPrice(next, { input_usd_per_mtok: 2, output_usd_per_mtok: 8, is_active: true })).toBeNull();
  });

  it("records a real increase with previous values and percentage", () => {
    const change = diffPrice(next, { input_usd_per_mtok: 1, output_usd_per_mtok: 4, is_active: true })!;
    expect(change.change_kind).toBe("increase");
    expect(change.prev_input_usd_per_mtok).toBe(1);
    expect(change.prev_output_usd_per_mtok).toBe(4);
    expect(change.pct_change).toBe(100);
  });

  it("records a real decrease", () => {
    const change = diffPrice(next, { input_usd_per_mtok: 4, output_usd_per_mtok: 16, is_active: true })!;
    expect(change.change_kind).toBe("decrease");
    expect(change.pct_change).toBe(-50);
  });

  it("relists a previously delisted row even when the price is unchanged", () => {
    const change = diffPrice(next, { input_usd_per_mtok: 2, output_usd_per_mtok: 8, is_active: false })!;
    expect(change.change_kind).toBe("relisted");
  });
});
