import { describe, expect, it } from "vitest";

import {
  MIN_LINE_PCT,
  addLineAt,
  maxShareFor,
  setShare,
  unallocatedPct,
  type DraftLine,
} from "../lines";

const line = (id: string, sharePct: number): DraftLine => ({
  id,
  workload: "chat",
  provider: null,
  modelKey: null,
  sharePct,
});

describe("setShare — carve from unallocated first", () => {
  it("takes growth from the remainder while there is one", () => {
    const before = [line("a", 30)];
    const after = setShare(before, "a", 45);
    expect(after[0].sharePct).toBe(45);
    expect(unallocatedPct(after)).toBe(55);
  });

  it("hands shrinkage straight back to the remainder", () => {
    const after = setShare([line("a", 60), line("b", 20)], "a", 40);
    expect(after.map((l) => l.sharePct)).toEqual([40, 20]);
    expect(unallocatedPct(after)).toBe(40);
  });

  it("only encroaches on other workloads once the remainder is gone", () => {
    const before = [line("a", 50), line("b", 20)]; // 30% unallocated
    const after = setShare(before, "b", 60);
    expect(unallocatedPct(after)).toBe(0);
    expect(after.find((l) => l.id === "b")!.sharePct).toBe(60);
    expect(after.find((l) => l.id === "a")!.sharePct).toBe(40); // 50 - the 10 deficit
  });

  it("takes from the largest donor first and never below the floor", () => {
    const before = [line("a", 70), line("b", 20), line("c", 8)];
    const after = setShare(before, "c", 80);
    expect(after.find((l) => l.id === "c")!.sharePct).toBe(80);
    expect(after.find((l) => l.id === "a")!.sharePct).toBe(MIN_LINE_PCT);
    expect(after.find((l) => l.id === "b")!.sharePct).toBe(18);
    expect(unallocatedPct(after)).toBe(0);
  });

  it("caps at the headroom every other workload's floor leaves", () => {
    const before = [line("a", 50), line("b", 50)];
    expect(maxShareFor(before, "a")).toBe(100 - MIN_LINE_PCT);
    const after = setShare(before, "a", 100);
    expect(after.find((l) => l.id === "a")!.sharePct).toBe(98);
    expect(after.find((l) => l.id === "b")!.sharePct).toBe(MIN_LINE_PCT);
  });

  it("never drops the moved workload below the floor", () => {
    const after = setShare([line("a", 40)], "a", 0);
    expect(after[0].sharePct).toBe(MIN_LINE_PCT);
  });
});

describe("addLineAt", () => {
  it("places a new workload at the picked share out of the remainder", () => {
    const after = addLineAt([line("a", 30)], line("b", 0), 45);
    expect(after.map((l) => l.sharePct)).toEqual([30, 45]);
    expect(unallocatedPct(after)).toBe(25);
  });

  it("borrows from existing workloads when the remainder is too small", () => {
    const after = addLineAt([line("a", 80)], line("b", 0), 40);
    expect(after.find((l) => l.id === "b")!.sharePct).toBe(40);
    expect(after.find((l) => l.id === "a")!.sharePct).toBe(60);
    expect(unallocatedPct(after)).toBe(0);
  });
});
