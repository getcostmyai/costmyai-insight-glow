import { describe, expect, it } from "vitest";

import { aggregateEstimate } from "../aggregate";
import type { EstimatorCatalog } from "../core";
import { MATERIALITY_USD } from "../spec";

/**
 * A minimal but real catalog: conversation work certifies on LCR, and the
 * feed carries enough spread on that instrument for the ladder to admit it.
 */
const CATALOG: EstimatorCatalog = {
  models: [
    { model_key: "premium", display_name: "Premium One" },
    { model_key: "thrifty", display_name: "Thrifty One" },
    { model_key: "weak", display_name: "Weak One" },
  ],
  prices: [
    price("premium", 15, 75),
    price("thrifty", 1, 5),
    price("weak", 40, 120),
  ],
  benchmarks: [
    { model_key: "premium", suite: "aa", task_class: "lcr", score: 80 },
    { model_key: "thrifty", suite: "aa", task_class: "lcr", score: 76 },
    { model_key: "weak", suite: "aa", task_class: "lcr", score: 60 },
  ],
  margins: [{ suite: "aa", task_class: "lcr", margin: 5 }],
};

function price(model_key: string, input: number, output: number) {
  return {
    model_key,
    host: `${model_key}-host`,
    host_label: "Acme",
    input_usd_per_mtok: input,
    output_usd_per_mtok: output,
    cache_read_usd_per_mtok: null,
    cache_write_usd_per_mtok: null,
    supports_prompt_caching: false,
  } as EstimatorCatalog["prices"][number];
}

const named = (sharePct: number) => ({
  workload: "chat" as const,
  provider: "Acme",
  modelKey: "premium",
  sharePct,
});

describe("aggregateEstimate", () => {
  it("totals exactly the sum of the rounded per-line figures", () => {
    const out = aggregateEstimate(CATALOG, {
      totalSpendUsd: 10_000,
      lines: [named(40), named(35)],
    });

    const [a, b] = out.lines;
    expect(a.result.state).toBe("ok");
    expect(b.result.state).toBe("ok");
    if (a.result.state !== "ok" || b.result.state !== "ok") return;

    expect(a.result.highUsd).toBeGreaterThanOrEqual(MATERIALITY_USD);
    expect(b.result.highUsd).toBeGreaterThanOrEqual(MATERIALITY_USD);
    expect(out.totalCertifiedSavingUsd).toBe(a.result.highUsd + b.result.highUsd);
    expect(out.totalCertifiedSavingLowUsd).toBe(a.result.lowUsd + b.result.lowUsd);
    expect(out.certifiedSharePct).toBe(75);
  });

  it("keeps a sub-threshold line visible but contributing nothing", () => {
    const out = aggregateEstimate(CATALOG, {
      totalSpendUsd: 1_000,
      lines: [named(3)],
    });

    const line = out.lines[0];
    expect(out.lines).toHaveLength(1);
    expect(line.lineSpendUsd).toBe(30);
    expect(line.result.state).toBe("below_threshold");
    if (line.result.state !== "below_threshold") return;
    expect(line.result.highUsd).toBeLessThan(MATERIALITY_USD);
    expect(line.result.floorUsd).toBe(MATERIALITY_USD);
    expect(line.countedInTotal).toBe(false);
    expect(out.totalCertifiedSavingUsd).toBe(0);
  });

  it("carries a refusal without blocking the other lines", () => {
    const out = aggregateEstimate(CATALOG, {
      totalSpendUsd: 10_000,
      lines: [
        { workload: "chat", provider: null, modelKey: null, sharePct: 20 },
        named(40),
      ],
    });

    const [refused, ok] = out.lines;
    expect(refused.result.state).toBe("refused");
    if (refused.result.state === "refused") {
      expect(refused.result.reason).toBe("shape_only");
    }
    expect(refused.countedInTotal).toBe(false);
    expect(ok.result.state).toBe("ok");
    if (ok.result.state !== "ok") return;
    expect(out.totalCertifiedSavingUsd).toBe(ok.result.highUsd);
  });

  it("reports the unallocated remainder exactly", () => {
    const out = aggregateEstimate(CATALOG, {
      totalSpendUsd: 10_000,
      lines: [named(40), named(35), named(3)],
    });

    expect(out.unallocated.sharePct).toBe(22);
    expect(out.unallocated.impliedSpendUsd).toBe(2_200);
  });

  it("has no remainder when the spend is fully allocated", () => {
    const out = aggregateEstimate(CATALOG, {
      totalSpendUsd: 10_000,
      lines: [named(60), named(40)],
    });

    expect(out.unallocated.sharePct).toBe(0);
    expect(out.unallocated.impliedSpendUsd).toBe(0);
  });
});
