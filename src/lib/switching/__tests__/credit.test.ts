import { describe, expect, it } from "vitest";

import { creditableUsd, savedUsdViolations } from "@/lib/switching/credit";
import { decideExecutable, phaseFor } from "@/lib/ingest/switch-plan";
import { executionStateFor } from "@/lib/dashboard/execution-copy";

/**
 * Dispatch 161. The invariant that a switch which is not rerouting cannot hold
 * captured money, proved on the same pure decision the server and the
 * container's plan are both built from.
 */
const stateFor = (input: {
  fromHost: string;
  toHost: string;
  toShape: string | null;
  gate: "not_connected" | "connected" | "granted";
  autonomous?: boolean;
  everSwitchedTo?: boolean;
}) => {
  const phase = phaseFor(input);
  const d = decideExecutable({
    phase,
    gate: input.gate,
    autonomous: Boolean(input.autonomous),
    everSwitchedTo: input.everSwitchedTo ?? true,
  });
  return executionStateFor({ phase, executable: d.executable, ...(d.reason ? { blockedReason: d.reason } : {}) });
};

describe("saved_usd may only exist where traffic actually moved", () => {
  it("credits a same-host switch on a connected provider", () => {
    const state = stateFor({ fromHost: "openai", toHost: "openai", toShape: "openai", gate: "connected" });
    expect(state).toBe("automatic");
    expect(creditableUsd({ state, observedUsd: 12.34 })).toBe(12.34);
  });

  it("refuses a cross-provider switch that has no routing grant", () => {
    const state = stateFor({ fromHost: "azure", toHost: "openai", toShape: "openai", gate: "connected" });
    expect(state).toBe("needs_your_action");
    expect(creditableUsd({ state, observedUsd: 568.36 })).toBe(0);
  });

  it("refuses a destination the workspace has never connected", () => {
    const state = stateFor({ fromHost: "alibaba", toHost: "ionstream", toShape: "openai", gate: "not_connected" });
    expect(state).toBe("needs_your_action");
    expect(creditableUsd({ state, observedUsd: 187.44 })).toBe(0);
  });

  it("refuses Bedrock and Vertex outright, grant or no grant", () => {
    const state = stateFor({ fromHost: "openai", toHost: "bedrock", toShape: null, gate: "granted" });
    expect(state).toBe("not_available_yet");
    expect(creditableUsd({ state, observedUsd: 99 })).toBe(0);
  });

  it("flags every stored row that holds money it did not move", () => {
    const violations = savedUsdViolations([
      { id: "ok-automatic", savedUsd: 41.8, state: "automatic" as const },
      { id: "ok-zero", savedUsd: 0, state: "needs_your_action" as const },
      { id: "bad-waiting", savedUsd: 568.36, state: "needs_your_action" as const },
      { id: "bad-unavailable", savedUsd: 12.12, state: "not_available_yet" as const },
      { id: "bad-unknown", savedUsd: 1, state: undefined },
    ]);
    expect(violations.map((v) => v.id)).toEqual(["bad-waiting", "bad-unavailable", "bad-unknown"]);
  });
});
