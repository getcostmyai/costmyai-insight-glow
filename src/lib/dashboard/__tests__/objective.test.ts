import { describe, expect, it } from "vitest";

import { resolveObjective } from "../../engine/objectives";
import {
  accountObjectiveRow,
  effectiveSelection,
  mergeObjectives,
  objectiveAvailable,
} from "../objective";

/**
 * Clause 07 in the dashboard. The selector is not a free-floating control: it
 * steers the quality check, so it is only meaningful on plans where the quality
 * check exists at all. Gating therefore decides where it can be placed.
 */

const workload = {
  model_key: "claude-opus-4.6",
  host: "anthropic",
  task_hint: "generation",
  requests: 1,
  input_tokens: 1,
  output_tokens: 1,
  cost_usd: 1,
  days: 30 as const,
};

describe("availability", () => {
  it("is locked on Compare and open from Certify up", () => {
    expect(objectiveAvailable("compare")).toBe(false);
    expect(objectiveAvailable("certify")).toBe(true);
    expect(objectiveAvailable("govern")).toBe(true);
  });

  it("falls back to cost when a locked plan asks for a non-default objective", () => {
    expect(effectiveSelection("compare", { objective: "latency", maxLatencyMs: 900 })).toEqual({
      objective: "cost",
    });
    expect(effectiveSelection("certify", { objective: "latency", maxLatencyMs: 900 })).toEqual({
      objective: "latency",
      maxLatencyMs: 900,
    });
  });
});

describe("resolution", () => {
  it("applies the selection account-wide", () => {
    const rows = mergeObjectives([], { objective: "quality_floor", qualityFloorScore: 72 });
    expect(accountObjectiveRow({ objective: "cost" }).model_key).toBeNull();
    expect(resolveObjective(rows, workload)).toEqual({
      objective: "quality_floor",
      qualityFloorScore: 72,
      maxLatencyMs: null,
    });
  });

  it("still lets a stored per-workload rule beat the account-wide selection", () => {
    const stored = [
      {
        model_key: "claude-opus-4.6",
        host: null,
        task_hint: null,
        objective: "latency" as const,
        quality_floor_score: null,
        max_latency_ms: 1200,
      },
    ];
    const rows = mergeObjectives(stored, { objective: "cost" });
    expect(resolveObjective(rows, workload).objective).toBe("latency");
    expect(resolveObjective(rows, { ...workload, model_key: "gpt-5.5" }).objective).toBe("cost");
  });
});
