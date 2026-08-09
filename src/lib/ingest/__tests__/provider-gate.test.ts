import { describe, expect, it } from "vitest";

import {
  FIRST_SWITCH_CONFIRM_LABEL,
  isExecutable,
  needsFirstSwitchConfirmation,
  NEW_PROVIDER_RATE_TIER_NOTE,
  providerGateCopy,
  type ProviderGate,
} from "@/lib/dashboard/provider-gate";
import { INGEST_API_VERSION, SUPPORTED_INGEST_API_VERSIONS } from "@/lib/ingest/contract";
import { ingestBatchSchema } from "@/lib/ingest/schema";

const event = (over: Record<string, unknown> = {}) => ({
  model_key: "claude-sonnet-4",
  host: "anthropic",
  input_tokens: 100,
  output_tokens: 20,
  ...over,
});

describe("ingest contract v2", () => {
  it("accepts a v1 batch unchanged", () => {
    const parsed = ingestBatchSchema.safeParse({ v: 1, events: [event()] });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.v).toBe(1);
    // v1 semantics untouched: no rerouting fields appear from nowhere.
    expect(parsed.success && parsed.data.events[0]!.rerouted).toBeUndefined();
  });

  it("accepts a v2 batch and defaults to the current version", () => {
    expect(INGEST_API_VERSION).toBe(2);
    expect(SUPPORTED_INGEST_API_VERSIONS).toEqual([1, 2]);
    const parsed = ingestBatchSchema.safeParse({ events: [event()] });
    expect(parsed.success && parsed.data.v).toBe(2);
  });

  it("refuses an unknown version rather than guessing", () => {
    expect(ingestBatchSchema.safeParse({ v: 3, events: [event()] }).success).toBe(false);
  });

  it("accepts a fully-formed rerouted event", () => {
    const parsed = ingestBatchSchema.safeParse({
      v: 2,
      events: [
        event({
          rerouted: true,
          original_model_key: "claude-opus-4",
          original_host: "anthropic",
          route_reason: "3f6d5b8a-0f4a-4f2e-9a55-2f7a0a1b2c3d",
        }),
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("refuses a rerouted event that cannot say what it moved away from", () => {
    const parsed = ingestBatchSchema.safeParse({
      v: 2,
      events: [event({ rerouted: true })],
    });
    expect(parsed.success).toBe(false);
  });

  it("still refuses content and credentials on v2", () => {
    expect(
      ingestBatchSchema.safeParse({ v: 2, events: [event({ prompt: "hello" })] }).success,
    ).toBe(false);
    expect(
      ingestBatchSchema.safeParse({ v: 2, events: [event({ api_key: "sk-live-x" })] }).success,
    ).toBe(false);
    expect(
      ingestBatchSchema.safeParse({
        v: 2,
        events: [event({ parse_status: "unparsed", envelope_skeleton: { choices: ["text"] } })],
      }).success,
    ).toBe(false);
  });
});

describe("provider gate", () => {
  const gate = (over: Partial<ProviderGate> = {}): ProviderGate => ({
    host: "together",
    state: "granted",
    lastSeenAt: "2026-08-06",
    activeRecently: true,
    everSwitchedTo: true,
    ...over,
  });

  it("only a granted destination is executable", () => {
    expect(isExecutable(gate({ state: "granted" }))).toBe(true);
    expect(isExecutable(gate({ state: "connected" }))).toBe(false);
    expect(isExecutable(gate({ state: "not_connected" }))).toBe(false);
    expect(isExecutable(undefined)).toBe(false);
  });

  it("asks once before the first autonomous switch to a new destination", () => {
    expect(needsFirstSwitchConfirmation(gate({ everSwitchedTo: false }), true)).toBe(true);
    expect(needsFirstSwitchConfirmation(gate({ everSwitchedTo: true }), true)).toBe(false);
    // Manual switching already is a confirmation.
    expect(needsFirstSwitchConfirmation(gate({ everSwitchedTo: false }), false)).toBe(false);
  });

  it("names both providers in the not-connected copy and holds the promise", () => {
    const copy = providerGateCopy.not_connected("Together AI", "Anthropic");
    expect(copy.label).toBe("Connect Together AI first");
    expect(copy.detail).toContain("Anthropic");
    expect(copy.detail).toContain("We never hold the credential.");
  });

  it("tells the customer where the key goes in the connected-not-granted copy", () => {
    const copy = providerGateCopy.connected("Together AI");
    expect(copy.label).toBe("Allow routing to Together AI");
    expect(copy.detail).toContain("its own Together AI key");
    expect(copy.detail).toContain("we never see it");
  });

  it("discloses the rate tier rather than burying it", () => {
    expect(NEW_PROVIDER_RATE_TIER_NOTE).toContain("lowest rate tier");
    expect(FIRST_SWITCH_CONFIRM_LABEL.length).toBeGreaterThan(0);
  });
});
