import { describe, expect, it } from "vitest";

import { benchmarkOnlySaving } from "../../dashboard.server";

/**
 * The claim under test: "only a benchmark can unlock this money".
 * A workload a cheaper host already reaches falsifies that sentence, whatever
 * the certified saving on it is, so it must not contribute a cent.
 */

const q = (taskHint: string, savingUsd: number, fromModel = "openai/gpt-4") => ({
  fromModel,
  fromHost: "azure",
  taskHint,
  savingUsd,
});

const a = (taskHint: string, fromModel = "openai/gpt-4") => ({
  fromModel,
  fromHost: "azure",
  taskHint,
});

describe("benchmark-only saving", () => {
  it("excludes any workload that also has a host_arbitrage recommendation", () => {
    const total = benchmarkOnlySaving([q("chat", 4000), q("summarise", 2532)], [a("chat")]);

    expect(total).toBe(2532);
  });

  it("is the full benchmark sum when no workload has a cheaper host", () => {
    expect(benchmarkOnlySaving([q("chat", 4000), q("summarise", 2532)], [])).toBe(6532);
  });

  it("is zero when every certified workload also has a cheaper host", () => {
    expect(benchmarkOnlySaving([q("chat", 4000)], [a("chat"), a("summarise")])).toBe(0);
  });

  it("matches only on the whole workload key, not on the model alone", () => {
    // Same model and host, different task: a different workload entirely.
    expect(benchmarkOnlySaving([q("chat", 100)], [a("summarise")])).toBe(100);
  });

  it("never counts one workload twice when two certified rows target it", () => {
    expect(benchmarkOnlySaving([q("chat", 100), q("chat", 250)], [])).toBe(250);
  });

  it("ignores non-positive savings", () => {
    expect(benchmarkOnlySaving([q("chat", 0), q("summarise", -5)], [])).toBe(0);
  });
});
