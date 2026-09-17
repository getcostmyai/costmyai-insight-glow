import { describe, expect, it } from "vitest";

import { benchmarkOnlySaving } from "../../dashboard.server";

/**
 * The claim under test: "only a benchmark can unlock this money".
 *
 * Every certified switch is priced from the cheapest host for the model the
 * workload runs on today, so the certified figure is already the increment
 * past what a host swap can reach. A cheaper host on the same workload takes
 * nothing away from it, which is why no workload is excluded here.
 */

const q = (taskHint: string, savingUsd: number, fromModel = "openai/gpt-4") => ({
  fromModel,
  fromHost: "azure",
  taskHint,
  savingUsd,
});

describe("benchmark-only saving", () => {
  it("still counts a workload that also has a cheaper host, because the increment is benchmark-only", () => {
    expect(benchmarkOnlySaving([q("chat", 4000), q("summarise", 2532)])).toBe(6532);
  });

  it("is the full certified sum when no workload has a cheaper host", () => {
    expect(benchmarkOnlySaving([q("chat", 4000), q("summarise", 2532)])).toBe(6532);
  });

  it("counts every certified workload, one contribution each", () => {
    expect(benchmarkOnlySaving([q("chat", 4000), q("summarise", 100)])).toBe(4100);
  });

  it("keys on the whole workload, not on the model alone", () => {
    expect(benchmarkOnlySaving([q("chat", 100), q("summarise", 250)])).toBe(350);
  });

  it("never counts one workload twice when two certified rows target it", () => {
    expect(benchmarkOnlySaving([q("chat", 100), q("chat", 250)])).toBe(250);
  });

  it("ignores non-positive savings", () => {
    expect(benchmarkOnlySaving([q("chat", 0), q("summarise", -5)])).toBe(0);
  });
});
