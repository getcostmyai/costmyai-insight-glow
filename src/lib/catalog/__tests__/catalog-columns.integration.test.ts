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

  it("derives Intelligence only from scores actually present", async () => {
    const { rows } = await readCatalog();
    for (const r of rows.slice(0, 400)) {
      const present = [r.gpqa, r.ifbench, r.coding].filter((v): v is number => v !== null);
      if (present.length === 0) {
        expect(r.intelligence).toBeNull();
      } else {
        const mean = present.reduce((a, b) => a + b, 0) / present.length;
        expect(r.intelligence).toBeCloseTo(Math.round(mean * 10) / 10, 5);
      }
    }
  }, 30_000);
});
