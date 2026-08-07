import { describe, expect, it } from "vitest";

import {
  detectFlatPriceRisingQuality,
  detectListingClusters,
  detectPriceMoves,
  detectProviderSpreads,
  detectSaturation,
  detectScoreDrift,
} from "../leads";

const NOW = Date.parse("2026-08-07T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

describe("detector 1 — outsized price move", () => {


  it("fires when a move dwarfs the model's own typical move", () => {
    const leads = detectPriceMoves(
      [
        { model_key: "m", host: "h", pct_change: 3, change_kind: "increase", observed_at: daysAgo(40) },
        { model_key: "m", host: "h", pct_change: -4, change_kind: "decrease", observed_at: daysAgo(30) },
        { model_key: "m", host: "h", pct_change: 5, change_kind: "increase", observed_at: daysAgo(20) },
        { model_key: "m", host: "h", pct_change: -60, change_kind: "decrease", observed_at: daysAgo(1) },
      ],
      NOW,
    );
    expect(leads).toHaveLength(1);
    expect(leads[0]!.evidence).toMatchObject({ pctChange: -60, typicalAbsPct: 4 });
  });

  it("stays quiet when the move is normal for that model", () => {
    expect(
      detectPriceMoves(
        [
          { model_key: "m", host: "h", pct_change: 40, change_kind: "increase", observed_at: daysAgo(40) },
          { model_key: "m", host: "h", pct_change: -45, change_kind: "decrease", observed_at: daysAgo(30) },
          { model_key: "m", host: "h", pct_change: 50, change_kind: "increase", observed_at: daysAgo(20) },
          { model_key: "m", host: "h", pct_change: -55, change_kind: "decrease", observed_at: daysAgo(1) },
        ],
        NOW,
      ),
    ).toHaveLength(0);
  });

  it("needs a very large move when there is no history to compare against", () => {
    const rows = [
      { model_key: "m", host: "h", pct_change: -60, change_kind: "decrease", observed_at: daysAgo(1) },
    ];
    expect(detectPriceMoves(rows, NOW)).toHaveLength(0);
    expect(
      detectPriceMoves([{ ...rows[0]!, pct_change: -140 }], NOW),
    ).toHaveLength(1);
  });
});

describe("detector 2 — provider spread on identical weights", () => {
  it("fires above the ratio threshold with enough providers", () => {
    const leads = detectProviderSpreads([
      { model_key: "m", host_label: "A", input_usd_per_mtok: 0.1, output_usd_per_mtok: 0.2 },
      { model_key: "m", host_label: "B", input_usd_per_mtok: 0.4, output_usd_per_mtok: 0.6 },
      { model_key: "m", host_label: "C", input_usd_per_mtok: 1.2, output_usd_per_mtok: 2 },
    ]);
    expect(leads).toHaveLength(1);
    expect(leads[0]!.evidence).toMatchObject({ ratio: 12, providers: 3 });
  });

  it("ignores a two-provider listing however wide", () => {
    expect(
      detectProviderSpreads([
        { model_key: "m", host_label: "A", input_usd_per_mtok: 0.1, output_usd_per_mtok: 0.2 },
        { model_key: "m", host_label: "B", input_usd_per_mtok: 9, output_usd_per_mtok: 9 },
      ]),
    ).toHaveLength(0);
  });
});

describe("detector 3 — benchmark saturation", () => {
  const margins = [{ suite: "aa:gpqa", task_class: "gpqa", margin: 5 }];

  it("fires when the top band is crowded", () => {
    const scores = [
      ...Array.from({ length: 12 }, (_, i) => ({
        model_key: `top${i}`,
        suite: "aa:gpqa",
        task_class: "gpqa",
        score: 90 + (i % 5) * 0.5,
      })),
      ...Array.from({ length: 20 }, (_, i) => ({
        model_key: `tail${i}`,
        suite: "aa:gpqa",
        task_class: "gpqa",
        score: 40 + i,
      })),
    ];
    const leads = detectSaturation(scores, margins);
    expect(leads).toHaveLength(1);
    expect(leads[0]!.evidence).toMatchObject({ tied: 12, measured: 32 });
  });

  it("ignores the 0.000 not-measured sentinel", () => {
    const scores = Array.from({ length: 12 }, (_, i) => ({
      model_key: `z${i}`,
      suite: "aa:gpqa",
      task_class: "gpqa",
      score: 0,
    }));
    expect(detectSaturation(scores, margins)).toHaveLength(0);
  });
});

describe("detector 4 — cluster of new listings", () => {
  const listing = (host: string, n: number, iso: string) =>
    Array.from({ length: n }, (_, i) => ({
      model_key: `${host}-${iso}-${i}`,
      host,
      host_label: host.toUpperCase(),
      first_seen_at: iso,
    }));

  it("fires on a real cluster and excludes the backfill day", () => {
    const rows = [
      ...listing("openrouter", 40, "2026-07-31T00:00:00Z"), // catalog backfill
      ...listing("openrouter", 12, "2026-08-06T09:00:00Z"),
    ];
    const leads = detectListingClusters(rows, NOW);
    expect(leads).toHaveLength(1);
    expect(leads[0]!.evidence).toMatchObject({ day: "2026-08-06", count: 12 });
  });

  it("does not invent a cluster out of a first sync", () => {
    expect(detectListingClusters(listing("openai", 60, "2026-07-31T00:00:00Z"), NOW)).toHaveLength(0);
  });
});

/**
 * Detectors 5 and 6 cannot fire on today's production history: no
 * (model, suite, task_class) pair has yet been measured across two sync runs.
 * These are LABELLED TEST SCENARIOS — synthetic rows shaped exactly like the
 * history the detectors are waiting for.
 */
describe("detector 5 — silent drift (test scenario, no real data yet)", () => {
  const margins = [{ suite: "aa:gpqa", task_class: "gpqa", margin: 5 }];

  it("fires when the same model key moves past twice the margin between runs", () => {
    const leads = detectScoreDrift(
      [
        {
          model_key: "vendor/model-x",
          suite: "aa:gpqa",
          task_class: "gpqa",
          score: 80,
          measured_at: daysAgo(30),
          source_run_id: "run-a",
        },
        {
          model_key: "vendor/model-x",
          suite: "aa:gpqa",
          task_class: "gpqa",
          score: 68,
          measured_at: daysAgo(2),
          source_run_id: "run-b",
        },
      ],
      margins,
    );
    expect(leads).toHaveLength(1);
    expect(leads[0]!.evidence).toMatchObject({ delta: -12, margin: 5 });
  });

  it("stays quiet inside the measurement margin", () => {
    expect(
      detectScoreDrift(
        [
          { model_key: "m", suite: "aa:gpqa", task_class: "gpqa", score: 80, measured_at: daysAgo(30), source_run_id: "a" },
          { model_key: "m", suite: "aa:gpqa", task_class: "gpqa", score: 76, measured_at: daysAgo(2), source_run_id: "b" },
        ],
        margins,
      ),
    ).toHaveLength(0);
  });

  it("stays quiet when only one sync run exists — today's real state", () => {
    expect(
      detectScoreDrift(
        [
          { model_key: "m", suite: "aa:gpqa", task_class: "gpqa", score: 80, measured_at: daysAgo(2), source_run_id: "a" },
        ],
        margins,
      ),
    ).toHaveLength(0);
  });
});

describe("detector 6 — silent price cut (test scenario, no real data yet)", () => {
  const margins = [{ suite: "aa:scicode", task_class: "scicode", margin: 5 }];
  const scores = [
    { model_key: "vendor/model-y", suite: "aa:scicode", task_class: "scicode", score: 60, measured_at: daysAgo(40), source_run_id: "a" },
    { model_key: "vendor/model-y", suite: "aa:scicode", task_class: "scicode", score: 72, measured_at: daysAgo(2), source_run_id: "b" },
  ];

  it("fires when quality rises while the price holds", () => {
    const leads = detectFlatPriceRisingQuality(
      [
        { model_key: "vendor/model-y", host: "h", host_label: "H", input_usd_per_mtok: 2, observed_at: daysAgo(40) },
        { model_key: "vendor/model-y", host: "h", host_label: "H", input_usd_per_mtok: 2, observed_at: daysAgo(2) },
      ],
      scores,
      margins,
    );
    expect(leads).toHaveLength(1);
    expect(leads[0]!.evidence).toMatchObject({ gain: 12, priceMovePct: 0 });
  });

  it("stays quiet when the price also moved — that is a price cut, not a silent one", () => {
    expect(
      detectFlatPriceRisingQuality(
        [
          { model_key: "vendor/model-y", host: "h", host_label: "H", input_usd_per_mtok: 2, observed_at: daysAgo(40) },
          { model_key: "vendor/model-y", host: "h", host_label: "H", input_usd_per_mtok: 1, observed_at: daysAgo(2) },
        ],
        scores,
        margins,
      ),
    ).toHaveLength(0);
  });
});
