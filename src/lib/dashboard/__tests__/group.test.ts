import { describe, expect, it } from "vitest";

import { groupByWorkload, groupFor, isBestRow, type WorkloadOption } from "../group";

const W = { fromModel: "a/big", fromHost: "azure", taskHint: "chat" };
const W2 = { fromModel: "b/small", fromHost: "openai", taskHint: "code" };

const opt = (
  kind: WorkloadOption["kind"],
  toModel: string,
  toHost: string,
  saving: number,
): WorkloadOption => ({ kind, toModel, toHost, toHostLabel: toHost, saving, savingPct: 10 });

describe("groupByWorkload (Dispatch 213)", () => {
  it("collapses every mechanism's finding for one workload into a single card", () => {
    const [g] = groupByWorkload({
      unlocked: [
        { workload: W, option: opt("host_arbitrage", "a/big", "openai", 100) },
        { workload: W, option: opt("quality_match", "c/cheap", "openai", 420) },
        { workload: W, option: opt("rightsize", "d/mini", "azure", 300) },
      ],
      locked: [],
    });
    expect(g.best.kind).toBe("quality_match");
    expect(g.best.saving).toBe(420);
    // Alternatives stay visible and ranked — never hidden, never summed.
    expect(g.alternatives.map((a) => a.saving)).toEqual([300, 100]);
  });

  it("never sums alternatives into the best figure", () => {
    const [g] = groupByWorkload({
      unlocked: [
        { workload: W, option: opt("host_arbitrage", "a/big", "openai", 100) },
        { workload: W, option: opt("rightsize", "d/mini", "azure", 300) },
      ],
      locked: [],
    });
    expect(g.best.saving).toBe(300);
  });

  it("keeps a locked finding count-only: no model, no money", () => {
    const [g] = groupByWorkload({
      unlocked: [{ workload: W, option: opt("host_arbitrage", "a/big", "openai", 100) }],
      locked: [
        { workload: W, requiredPlan: "rightsize" },
        { workload: W, requiredPlan: "rightsize" },
      ],
    });
    expect(g.locked).toEqual([{ requiredPlan: "rightsize", count: 2 }]);
    const serialised = JSON.stringify(g.locked);
    expect(serialised).not.toContain("d/mini");
    expect(serialised).not.toMatch(/saving/);
  });

  it("drops a workload whose only findings are locked — the level owns that summary", () => {
    const groups = groupByWorkload({
      unlocked: [],
      locked: [{ workload: W, requiredPlan: "certify" }],
    });
    expect(groups).toEqual([]);
  });

  it("keeps workloads separate and orders cards by the best saving", () => {
    const groups = groupByWorkload({
      unlocked: [
        { workload: W, option: opt("host_arbitrage", "x", "openai", 10) },
        { workload: W2, option: opt("host_arbitrage", "y", "openai", 90) },
      ],
      locked: [],
    });
    expect(groups.map((g) => g.workload.fromModel)).toEqual(["b/small", "a/big"]);
  });

  it("draws the card exactly once, in the list that found the best option", () => {
    const groups = groupByWorkload({
      unlocked: [
        { workload: W, option: opt("host_arbitrage", "a/big", "openai", 100) },
        { workload: W, option: opt("quality_match", "c/cheap", "openai", 420) },
      ],
      locked: [],
    });
    const g = groupFor(groups, W);
    expect(isBestRow(g, { kind: "quality_match", toModel: "c/cheap", toHost: "openai" })).toBe(true);
    expect(isBestRow(g, { kind: "host_arbitrage", toModel: "a/big", toHost: "openai" })).toBe(false);
  });

  it("matches workloads case- and whitespace-insensitively", () => {
    const groups = groupByWorkload({
      unlocked: [{ workload: W, option: opt("host_arbitrage", "a/big", "openai", 1) }],
      locked: [],
    });
    expect(groupFor(groups, { fromModel: " A/BIG ", fromHost: "Azure", taskHint: "Chat" })).not.toBe(
      null,
    );
  });
});
