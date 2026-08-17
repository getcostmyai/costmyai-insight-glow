import { describe, expect, it } from "vitest";
import { groupByWorkload, isBestRow } from "../group";

const workload = { fromModel: "gpt-4", fromHost: "openai", taskHint: "chat" };

describe("equal-savings tie-break", () => {
  it("gives an exact tie to right-size, not to build order", () => {
    const [group] = groupByWorkload({
      locked: [],
      unlocked: [
        // Build order is arbitrage → quality → rightsize, as in dashboard.server.ts.
        {
          workload,
          option: {
            kind: "host_arbitrage" as const,
            toModel: "gpt-4",
            toHost: "azure",
            toHostLabel: "Azure",
            saving: 605.79,
            savingPct: 12,
          },
        },
        {
          workload,
          option: {
            kind: "quality_match" as const,
            toModel: "claude-sonnet",
            toHost: "anthropic",
            toHostLabel: "Anthropic",
            saving: 605.79,
            savingPct: 12,
          },
        },
        {
          workload,
          option: {
            kind: "rightsize" as const,
            toModel: "gpt-4-mini",
            toHost: "openai",
            toHostLabel: "OpenAI",
            saving: 605.79,
            savingPct: 12,
          },
        },
      ],
    });

    expect(group.best.kind).toBe("rightsize");
    // The right-size row therefore renders actionable, not disclosure-only.
    expect(isBestRow(group, { kind: "rightsize", toModel: "gpt-4-mini", toHost: "openai" })).toBe(true);
    expect(isBestRow(group, { kind: "quality_match", toModel: "claude-sonnet", toHost: "anthropic" })).toBe(false);
  });

  it("treats sub-cent differences as a tie", () => {
    const [group] = groupByWorkload({
      locked: [],
      unlocked: [
        {
          workload,
          option: { kind: "quality_match" as const, toModel: "c", toHost: "anthropic", toHostLabel: "A", saving: 100.004, savingPct: 5 },
        },
        {
          workload,
          option: { kind: "rightsize" as const, toModel: "m", toHost: "openai", toHostLabel: "O", saving: 100.0, savingPct: 5 },
        },
      ],
    });
    expect(group.best.kind).toBe("rightsize");
  });

  it("still lets a genuinely larger saving win", () => {
    const [group] = groupByWorkload({
      locked: [],
      unlocked: [
        {
          workload,
          option: { kind: "quality_match" as const, toModel: "c", toHost: "anthropic", toHostLabel: "A", saving: 200, savingPct: 9 },
        },
        {
          workload,
          option: { kind: "rightsize" as const, toModel: "m", toHost: "openai", toHostLabel: "O", saving: 100, savingPct: 5 },
        },
      ],
    });
    expect(group.best.kind).toBe("quality_match");
  });
});
