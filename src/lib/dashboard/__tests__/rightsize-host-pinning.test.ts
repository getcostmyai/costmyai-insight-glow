/**
 * Dispatch 231 — one host per right-size switch, agreed by every component.
 *
 * The defect this pins: `findOversized` ranks the cheapest model at the
 * required tier across every priced host, so its target is frequently on a
 * different provider. The activation writer pinned the destination to the
 * WORKLOAD's host instead, which turned a cross-provider switch into a
 * same-host one — Phase 1, executable, and instructing a container to ask
 * Anthropic for a model only Novita serves. It would have 404'd on the first
 * live call of the first real workload the product ever produced.
 *
 * These tests assert the invariant, not the incident: the host the engine
 * resolved is the host that travels, and the phase gate classifies it from
 * those same two hosts.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { findOversized } from "@/lib/engine/rightsize";
import type { ModelRow, PriceRow, UsageAggregate } from "@/lib/engine/types";
import { phaseFor } from "@/lib/ingest/switch-plan";

const usage: UsageAggregate[] = [
  {
    model_key: "anthropic/claude-opus-5",
    host: "anthropic",
    task_hint: "unknown",
    requests: 400,
    input_tokens: 400_000,
    output_tokens: 40_000,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    cost_usd: 5,
    days: 30,
    output_p50: 100,
    output_p95: 120,
  },
];

const models: ModelRow[] = [
  { model_key: "anthropic/claude-opus-5", display_name: "Opus 5", vendor: "anthropic", tier: "frontier" },
  { model_key: "vendor/tiny-flash", display_name: "Tiny Flash", vendor: "vendor", tier: "economy" },
] as ModelRow[];

const price = (model: string, host: string, inUsd: number, outUsd: number): PriceRow =>
  ({
    model_key: model,
    host,
    host_label: host,
    input_usd_per_mtok: inUsd,
    output_usd_per_mtok: outUsd,
    supports_prompt_caching: false,
  }) as PriceRow;

const prices: PriceRow[] = [
  price("anthropic/claude-opus-5", "anthropic", 5, 25),
  // The cheap economy model exists only somewhere else. That is the real case.
  price("vendor/tiny-flash", "novita", 0.02, 0.05),
];

describe("right-size destination host", () => {
  it("reports the host the recommended model actually lives on", () => {
    const [rec] = findOversized(usage, models, prices);
    expect(rec).toBeTruthy();
    expect(rec!.toModel).toBe("vendor/tiny-flash");
    expect(rec!.toHost).toBe("novita");
    expect(rec!.toHost).not.toBe(rec!.fromHost);
  });

  it("classifies that switch as Phase 2, so the routing grant is required", () => {
    const [rec] = findOversized(usage, models, prices);
    // Anthropic-shaped destination or not, the point is that it is NOT Phase 1:
    // Phase 1 means the container already fronts this provider with the
    // customer's own key, which is untrue the moment the host changes.
    expect(phaseFor({ fromHost: rec!.fromHost, toHost: rec!.toHost!, toShape: "openai" })).toBe(2);
    expect(phaseFor({ fromHost: rec!.fromHost, toHost: rec!.fromHost, toShape: "openai" })).toBe(1);
  });

  it("the activation writer does not re-pin the destination to the source host", () => {
    // Source-level, deliberately: the regression was a single line in the
    // writer that silently disagreed with the engine, and no runtime assertion
    // downstream could have caught it — the switch it wrote was internally
    // well-formed, just wrong.
    const writer = readFileSync("src/lib/switches.functions.ts", "utf8");
    const rightsizeBranch = writer.slice(
      writer.indexOf('if (data.kind === "rightsize")'),
      writer.indexOf("} else {"),
    );
    expect(rightsizeBranch).toContain("toHost: o.toHost ?? o.hostKey");
    expect(rightsizeBranch).not.toMatch(/toHost:\s*o\.hostKey\s*,/);
  });
});
