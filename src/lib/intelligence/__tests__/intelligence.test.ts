import { describe, expect, it } from "vitest";

import {
  bucketHostCounts,
  summarizeMoves,
  type PriceHistoryRow,
} from "@/lib/intelligence/intelligence.server";

const row = (o: Partial<PriceHistoryRow>): PriceHistoryRow => ({
  model_key: "m",
  host: "h",
  change_kind: "increase",
  input_usd_per_mtok: 2,
  output_usd_per_mtok: 4,
  prev_input_usd_per_mtok: 1,
  prev_output_usd_per_mtok: 2,
  observed_at: "2026-08-01T00:00:00.000Z",
  ...o,
});

describe("intelligence price-move reconciliation", () => {
  it("total moves always equals increases + decreases", () => {
    const rows = [
      row({ change_kind: "increase" }),
      row({ change_kind: "decrease", input_usd_per_mtok: 0.5 }),
      // output-only reprice: input side is flat. This is the row class that
      // previously vanished from both buckets and broke 11 + 23 = 36.
      row({
        change_kind: "increase",
        input_usd_per_mtok: 1,
        prev_input_usd_per_mtok: 1,
        output_usd_per_mtok: 6,
        prev_output_usd_per_mtok: 2,
      }),
      row({
        change_kind: "decrease",
        input_usd_per_mtok: 1,
        prev_input_usd_per_mtok: 1,
        output_usd_per_mtok: 1,
        prev_output_usd_per_mtok: 2,
      }),
      row({ change_kind: "new", prev_input_usd_per_mtok: null, prev_output_usd_per_mtok: null }),
    ];

    const s = summarizeMoves(rows, new Map());

    expect(s.moves.length).toBe(s.increases.length + s.decreases.length);
    expect(s.increases.length).toBe(2);
    expect(s.decreases.length).toBe(2);
    expect(s.moves.length).toBe(4);
  });

  it("excludes new listings from the move total", () => {
    const s = summarizeMoves(
      [row({ change_kind: "new" }), row({ change_kind: "new" }), row({ change_kind: "increase" })],
      new Map(),
    );
    expect(s.newListings).toBe(2);
    expect(s.moves.length).toBe(1);
    expect(s.moves.length).toBe(s.increases.length + s.decreases.length);
  });

  it("ranks output-only moves by their output percentage", () => {
    const s = summarizeMoves(
      [
        row({
          change_kind: "increase",
          input_usd_per_mtok: 1,
          prev_input_usd_per_mtok: 1,
          output_usd_per_mtok: 3,
          prev_output_usd_per_mtok: 1,
        }),
      ],
      new Map(),
    );
    expect(s.moves[0].pct).toBeCloseTo(200);
  });

  it("takes direction from the ledger, never from one price side", () => {
    const s = summarizeMoves(
      [
        row({
          change_kind: "decrease",
          input_usd_per_mtok: 2,
          prev_input_usd_per_mtok: 1,
          output_usd_per_mtok: 0.1,
          prev_output_usd_per_mtok: 9,
        }),
      ],
      new Map(),
    );
    expect(s.decreases).toHaveLength(1);
    expect(s.increases).toHaveLength(0);
  });
});

describe("bucketHostCounts", () => {
  it("buckets provider-per-model counts and conserves the total", () => {
    const counts = [1, 1, 1, 2, 3, 4, 9, 10, 28];
    const buckets = bucketHostCounts(counts);
    expect(buckets.map((b) => b.label)).toEqual(["1", "2–3", "4–9", "10+"]);
    expect(buckets.map((b) => b.models)).toEqual([3, 2, 2, 2]);
    expect(buckets.reduce((s, b) => s + b.models, 0)).toBe(counts.length);
  });
});
