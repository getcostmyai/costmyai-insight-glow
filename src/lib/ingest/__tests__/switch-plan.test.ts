import { describe, expect, it } from "vitest";

import {
  decideExecutable,
  phaseFor,
  type SwitchPhase,
} from "../switch-plan";

/**
 * Dispatch 155, Stage 2 — the executability decision, proven without a
 * database. Every rule the container will obey is decided by this one pure
 * function, so these are the rules themselves, not a description of them.
 */

const base = { autonomous: false, everSwitchedTo: true };

describe("phaseFor", () => {
  it("puts a same-host model swap in Phase 1, whatever the shape", () => {
    expect(phaseFor({ fromHost: "bedrock", toHost: "bedrock", toShape: "bedrock" })).toBe(1);
    expect(phaseFor({ fromHost: "openai", toHost: "openai", toShape: "openai" })).toBe(1);
  });

  it("puts cross-provider routing on a rewritable shape in Phase 2", () => {
    expect(phaseFor({ fromHost: "openai", toHost: "together", toShape: "openai" })).toBe(2);
    expect(phaseFor({ fromHost: "openai", toHost: "anthropic", toShape: "anthropic" })).toBe(2);
  });

  it("puts signed and unknown shapes in Phase 3", () => {
    expect(phaseFor({ fromHost: "openai", toHost: "bedrock", toShape: "bedrock" })).toBe(3);
    expect(phaseFor({ fromHost: "openai", toHost: "vertex", toShape: null })).toBe(3);
  });
});

describe("decideExecutable", () => {
  it("executes a Phase 1 swap on a connected provider", () => {
    const d = decideExecutable({ ...base, phase: 1, gate: "connected" });
    expect(d).toEqual({ executable: true, needsConfirmation: false });
  });

  it("refuses anything to a provider that was never connected", () => {
    for (const phase of [1, 2, 3] as SwitchPhase[]) {
      const d = decideExecutable({ ...base, phase, gate: "not_connected" });
      expect(d.executable).toBe(false);
      expect(d.reason).toBe("provider_not_connected");
    }
  });

  it("refuses cross-provider routing to a connected but ungranted provider", () => {
    // Using a provider elsewhere is not permission to send traffic to it.
    const d = decideExecutable({ ...base, phase: 2, gate: "connected" });
    expect(d.executable).toBe(false);
    expect(d.reason).toBe("routing_not_granted");
  });

  it("executes cross-provider routing once the customer granted the key", () => {
    expect(decideExecutable({ ...base, phase: 2, gate: "granted" }).executable).toBe(true);
  });

  it("still refuses Phase 3 even when granted", () => {
    const d = decideExecutable({ ...base, phase: 3, gate: "granted" });
    expect(d.executable).toBe(false);
    expect(d.reason).toBe("shape_not_supported_yet");
  });

  it("asks once before the first autonomous switch to an untested destination", () => {
    const first = decideExecutable({
      phase: 1,
      gate: "connected",
      autonomous: true,
      everSwitchedTo: false,
    });
    expect(first).toEqual({
      executable: false,
      needsConfirmation: true,
      reason: "first_switch_needs_confirmation",
    });

    const second = decideExecutable({
      phase: 1,
      gate: "connected",
      autonomous: true,
      everSwitchedTo: true,
    });
    expect(second).toEqual({ executable: true, needsConfirmation: false });
  });

  it("never asks for confirmation on a manual switch", () => {
    const d = decideExecutable({
      phase: 1,
      gate: "connected",
      autonomous: false,
      everSwitchedTo: false,
    });
    expect(d).toEqual({ executable: true, needsConfirmation: false });
  });
});
