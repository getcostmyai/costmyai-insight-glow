import { describe, expect, it } from "vitest";
import { buildNonQualifying } from "../../dashboard.server";
import type { Refusal, UsageAggregate } from "../../engine/types";

const usage: UsageAggregate[] = [
  {
    model_key: "openai/gpt-4",
    host: "azure",
    task_hint: "chat",
    requests: 1000,
    input_tokens: 1_000_000,
    output_tokens: 200_000,
    cost_usd: 355,
    days: 30,
  },
];

const refusal = (over: Partial<Refusal>): Refusal => ({
  kind: "host_arbitrage",
  fromModel: "openai/gpt-4",
  fromHost: "azure",
  taskHint: "chat",
  reason: "no_cheaper_candidate",
  detail: "azure is already the cheapest priced host on record for openai/gpt-4.",
  ...over,
});

describe("List C dedupe", () => {
  it("renders a workload refused by two engines as exactly one row", () => {
    const rows = buildNonQualifying(
      [
        refusal({}),
        refusal({
          kind: "quality_match",
          reason: "no_baseline_score",
          detail: "No measured score for openai/gpt-4 on this task class.",
        }),
      ],
      usage,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.fromModel).toBe("openai/gpt-4");
    expect(rows[0]!.fromHost).toBe("azure");
    expect(rows[0]!.monthlySpend).toBe(355);
  });

  it("leads with the more informative verdict and keeps the other beside it", () => {
    const rows = buildNonQualifying(
      [
        refusal({ kind: "quality_match", reason: "no_baseline_score", detail: "no score" }),
        refusal({ reason: "no_cheaper_candidate" }),
      ],
      usage,
    );

    expect(rows[0]!.reason).toBe("no_cheaper_candidate");
    expect(rows[0]!.label).toBe("nothing cheaper to switch to");
    expect(rows[0]!.alsoLabels).toHaveLength(1);
    expect(rows[0]!.alsoLabels[0]).not.toBe(rows[0]!.label);
  });

  it("keeps three engines on the same workload to one row", () => {
    const rows = buildNonQualifying(
      [
        refusal({}),
        refusal({ kind: "quality_match", reason: "no_candidate_clears_bar", detail: "a" }),
        refusal({ kind: "rightsize", reason: "insufficient_sample", detail: "b" }),
      ],
      usage,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.reason).toBe("no_candidate_clears_bar");
    expect(rows[0]!.alsoLabels).toHaveLength(2);
  });

  it("keeps different workloads as separate rows", () => {
    const rows = buildNonQualifying(
      [refusal({}), refusal({ taskHint: "summarise" })],
      usage,
    );

    expect(rows).toHaveLength(2);
    const keys = rows.map((r) => `${r.fromModel}|${r.fromHost}|${r.taskHint}`);
    expect(new Set(keys).size).toBe(2);
  });

  it("never labels an arbitrage refusal as a quality claim", () => {
    const rows = buildNonQualifying([refusal({})], usage);
    expect(rows[0]!.label).not.toMatch(/quality/i);
  });
});

describe("List C excludes workloads that have a switch", () => {
  it("never lists a workload that holds an arbitrage recommendation, even when another engine refused it", () => {
    const rows = buildNonQualifying(
      [
        refusal({
          kind: "rightsize",
          reason: "already_right_sized",
          detail: "openai/gpt-4 is already the right size for this task.",
        }),
      ],
      usage,
      [{ fromModel: "openai/gpt-4", fromHost: "azure", taskHint: "chat" }],
    );

    expect(rows).toHaveLength(0);
  });

  it("still lists a workload whose recommendation belongs to a different workload", () => {
    const rows = buildNonQualifying([refusal({})], usage, [
      { fromModel: "openai/gpt-4", fromHost: "azure", taskHint: "summarise" },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.taskHint).toBe("chat");
  });
});
