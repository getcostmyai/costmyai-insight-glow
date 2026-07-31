import { describe, expect, it } from "vitest";

import { readCatalog } from "../catalog.server";

/**
 * The /models columns must be real or empty — never a placeholder. These run
 * against the live anon-readable catalog.
 */
describe("catalog metric columns", () => {
  it("exposes the benchmark and speed columns with real values or null", async () => {
    const { rows } = await readCatalog();
    expect(rows.length).toBeGreaterThan(0);

    for (const r of rows) {
      for (const v of [r.gpqa, r.ifbench, r.coding, r.intelligence, r.ttftMs, r.outputTps]) {
        expect(v === null || Number.isFinite(v)).toBe(true);
      }
      expect(r.modality).toMatch(/->/);
    }

    // At least one model is fully measured, so the columns are demonstrably live.
    expect(rows.some((r) => r.gpqa !== null && r.ttftMs !== null && r.outputTps !== null)).toBe(
      true,
    );
    // And at least one is honestly blank rather than filled with a guess.
    expect(rows.some((r) => r.coding === null)).toBe(true);
  }, 30_000);

  it("reads Intelligence from AA's published index, never from the other columns", async () => {
    const { rows } = await readCatalog();
    let checked = 0;
    for (const r of rows) {
      const published = r.scores.find((s) => s.suite === "aa:intelligence_index");
      expect(r.intelligence).toBe(published ? published.score : null);
      if (published) checked += 1;
      // A model can hold GPQA/IFBench/Coding and still have no index — proof
      // the column is not an average of the three sitting beside it.
      if (r.intelligence === null) {
        expect(published).toBeUndefined();
      }
    }
    expect(checked).toBeGreaterThan(0);
  }, 30_000);
});

