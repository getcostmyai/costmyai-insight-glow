/**
 * Dispatch 127 — the scanner's chain extraction, tested directly.
 *
 * Three recurrences of the "missing is_active filter" shape all went through
 * this one function, so its two failure modes are worth pinning down. Truncating
 * a chain early invents a gap that is not there; running past a chain's end
 * borrows a neighbouring query's filters and HIDES a gap that is. Both are
 * regressions this file must catch before a fourth recurrence.
 */
import { describe, expect, it } from "vitest";

import { scanSource } from "../schema-filters";

const watched = new Set(["host_prices"]);
const scan = (src: string) => scanSource("test.ts", src, watched);

describe("schema-filter chain extraction", () => {
  it("keeps reading past a blank line inside the chain", () => {
    const src = `
      supabase
        .from("host_prices")
        .select("model_key")

        .eq("is_active", true)
        .range(f, t)
    `;
    expect(scan(src)[0]!.filters).toContain("is_active");
  });

  it("keeps reading past comments, including prose containing commas", () => {
    const src = `
      supabase
        .from("host_prices")
        .select("model_key")
        // Delisted rows would let the engine recommend a host, which is wrong.
        .eq("is_active", true)
    `;
    expect(scan(src)[0]!.filters).toContain("is_active");
  });

  it("does not borrow a filter from the next query in the same block", () => {
    const src = `
      const a = supabase.from("host_prices").select("model_key");
      const b = supabase.from("model_catalog").select("model_key").eq("is_active", true);
    `;
    const site = scan(src).find((s) => s.table === "host_prices")!;
    expect(site.filters).not.toContain("is_active");
  });

  it("does not treat commas inside a column list as the end of the chain", () => {
    const src = `
      supabase
        .from("host_prices")
        .select("model_key, host, input_usd_per_mtok")
        .eq("is_active", true)
    `;
    expect(scan(src)[0]!.filters).toContain("is_active");
  });
});
